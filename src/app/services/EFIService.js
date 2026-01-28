/**
 * EFI Service - Integração com API Pix da EFI (Gerencianet)
 * 
 * Este serviço utiliza as credenciais configuradas no Integration
 * para criar cobranças PIX, consultar pagamentos, etc.
 */

const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');
const Integration = require('../schemas/Integration');

class EFIService {
  constructor() {
    this.tokenCache = new Map(); // Cache de tokens por tenant
  }

  /**
   * Obtém configuração EFI do tenant
   */
  async getConfig(tenantId) {
    const integration = await Integration.findOne({
      tenant_id: tenantId,
      type: 'efi'
    });

    if (!integration?.efi) {
      throw new Error('EFI não configurado para este tenant');
    }

    const ambiente = integration.efi.sandbox ? 'homologacao' : 'producao';
    const config = integration.efi[ambiente];

    if (!config?.client_id || !config?.client_secret) {
      throw new Error(`Credenciais EFI não configuradas para ${ambiente}`);
    }

    // Certificado é global do admin, não por tenant
    const certFilename = `efi-${ambiente}.p12`;
    const certificatePath = path.join(__dirname, '../../../certificates', certFilename);

    return {
      baseURL: integration.efi.sandbox
        ? 'https://api-pix-h.gerencianet.com.br'
        : 'https://api-pix.gerencianet.com.br',
      clientId: config.client_id,
      clientSecret: config.client_secret,
      pixKey: config.pix_key,
      certificatePath: certificatePath,
      sandbox: integration.efi.sandbox
    };
  }

  /**
   * Obtém certificado para autenticação
   */
  getCertificateAgent(certificatePath) {
    if (!certificatePath || !fs.existsSync(certificatePath)) {
      logger.warn('Certificado EFI não encontrado:', certificatePath);
      return new https.Agent({ rejectUnauthorized: false });
    }

    try {
      return new https.Agent({
        pfx: fs.readFileSync(certificatePath),
        passphrase: '' // EFI geralmente não usa senha
      });
    } catch (error) {
      logger.error('Erro ao carregar certificado EFI', { error: error.message });
      return new https.Agent({ rejectUnauthorized: false });
    }
  }

  /**
   * Obtém token de acesso OAuth2
   */
  async getAccessToken(tenantId) {
    // Verificar cache
    const cached = this.tokenCache.get(tenantId);
    if (cached && cached.expiration > Date.now()) {
      return cached.token;
    }

    try {
      const config = await this.getConfig(tenantId);
      const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
      
      const response = await axios.post(
        `${config.baseURL}/oauth/token`,
        { grant_type: 'client_credentials' },
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json'
          },
          httpsAgent: this.getCertificateAgent(config.certificatePath)
        }
      );

      const token = response.data.access_token;
      const expiration = Date.now() + (response.data.expires_in * 1000) - 60000; // -1min margem

      // Armazenar em cache
      this.tokenCache.set(tenantId, { token, expiration });

      logger.info('Token EFI obtido', { tenant: tenantId, sandbox: config.sandbox });
      return token;
    } catch (error) {
      logger.error('Erro ao obter token EFI', {
        tenant: tenantId,
        error: error.response?.data || error.message
      });
      throw new Error('Falha na autenticação com EFI');
    }
  }

  /**
   * Cria cobrança PIX imediata
   */
  async criarCobrancaPix(tenantId, dados) {
    try {
      const config = await this.getConfig(tenantId);
      const token = await this.getAccessToken(tenantId);
      const txid = this.gerarTxId();

      const body = {
        calendario: {
          expiracao: dados.expiracao || 3600 // 1 hora padrão
        },
        devedor: {
          cpf: dados.cpf?.replace(/\D/g, ''),
          cnpj: dados.cnpj?.replace(/\D/g, ''),
          nome: dados.nome
        },
        valor: {
          original: dados.valor.toFixed(2)
        },
        chave: config.pixKey,
        solicitacaoPagador: dados.descricao || 'Pagamento de assinatura',
        infoAdicionais: [
          {
            nome: 'Fatura',
            valor: dados.numero_fatura || 'N/A'
          }
        ]
      };

      const response = await axios.put(
        `${config.baseURL}/v2/cob/${txid}`,
        body,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          httpsAgent: this.getCertificateAgent(config.certificatePath)
        }
      );

      logger.info('Cobrança PIX criada', { txid, tenant: tenantId });

      // Buscar QR Code
      const qrCode = await this.buscarQrCode(tenantId, response.data.loc.id);

      return {
        txid: response.data.txid,
        status: response.data.status,
        loc_id: response.data.loc.id,
        qr_code: qrCode.qrcode,
        qr_code_image: qrCode.imagemQrcode,
        pix_copy_paste: qrCode.qrcode,
        expiracao: new Date(Date.now() + (dados.expiracao || 3600) * 1000)
      };
    } catch (error) {
      logger.error('Erro ao criar cobrança PIX', {
        tenant: tenantId,
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Busca QR Code da cobrança
   */
  async buscarQrCode(tenantId, locId) {
    try {
      const config = await this.getConfig(tenantId);
      const token = await this.getAccessToken(tenantId);

      const response = await axios.get(
        `${config.baseURL}/v2/loc/${locId}/qrcode`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          httpsAgent: this.getCertificateAgent(config.certificatePath)
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Erro ao buscar QR Code', {
        tenant: tenantId,
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Consulta cobrança PIX por txid
   */
  async consultarCobranca(tenantId, txid) {
    try {
      const config = await this.getConfig(tenantId);
      const token = await this.getAccessToken(tenantId);

      const response = await axios.get(
        `${config.baseURL}/v2/cob/${txid}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          httpsAgent: this.getCertificateAgent(config.certificatePath)
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Erro ao consultar cobrança', {
        tenant: tenantId,
        txid,
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Consulta PIX recebidos (para verificar pagamentos)
   */
  async consultarPixRecebidos(tenantId, dataInicio, dataFim) {
    try {
      const config = await this.getConfig(tenantId);
      const token = await this.getAccessToken(tenantId);

      const params = new URLSearchParams({
        inicio: dataInicio.toISOString(),
        fim: dataFim.toISOString()
      });

      const response = await axios.get(
        `${config.baseURL}/v2/pix?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          httpsAgent: this.getCertificateAgent(config.certificatePath)
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Erro ao consultar PIX recebidos', {
        tenant: tenantId,
        error: error.response?.data || error.message
      });
      throw error;
    }
  }

  /**
   * Gera txid único (26-35 caracteres alfanuméricos)
   */
  gerarTxId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 15).toUpperCase();
    const txid = `${timestamp}${random}`.replace(/[^A-Z0-9]/g, '');
    
    // Garantir que tenha entre 26 e 35 caracteres
    if (txid.length < 26) {
      const padding = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      return (txid + padding).substring(0, 26);
    }
    
    return txid.substring(0, 35);
  }
}

module.exports = new EFIService();
