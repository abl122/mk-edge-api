/**
 * Job de Geração Automática de Faturas Mensais
 * 
 * Este job deve ser executado diariamente para gerar faturas
 * para assinaturas ativas com ciclo mensal.
 * 
 * Recomendação: Usar cron ou node-cron para agendar execução
 * Exemplo: Executar todo dia 1º do mês às 00:00
 */

const mongoose = require('mongoose');
const Subscription = require('../app/schemas/Subscription');
const Invoice = require('../app/schemas/Invoice');
const InvoiceService = require('../app/services/InvoiceService');
const logger = require('../logger');

class InvoiceGenerationJob {
  /**
   * Gera faturas mensais para todas as assinaturas ativas
   */
  static async gerarFaturasMensais() {
    try {
      logger.info('Iniciando geração de faturas mensais...');

      const dataAtual = new Date();
      const mesAtual = dataAtual.getMonth();
      const anoAtual = dataAtual.getFullYear();

      // Buscar todas as assinaturas ativas com ciclo mensal
      const subscriptions = await Subscription.find({
        status: 'ativa',
        ciclo_cobranca: 'mensal',
        renovacao_automatica: true
      });

      logger.info(`Encontradas ${subscriptions.length} assinaturas ativas com ciclo mensal`);

      let geradas = 0;
      let erros = 0;

      for (const subscription of subscriptions) {
        try {
          // Verificar se já existe fatura para este mês
          const dataVencimento = new Date(subscription.data_vencimento);
          const mesVencimento = dataVencimento.getMonth();
          const anoVencimento = dataVencimento.getFullYear();

          // Se o vencimento é neste mês, verificar se já existe fatura
          if (mesVencimento === mesAtual && anoVencimento === anoAtual) {
            const faturaExistente = await Invoice.findOne({
              subscription_id: subscription._id,
              data_vencimento: {
                $gte: new Date(anoAtual, mesAtual, 1),
                $lt: new Date(anoAtual, mesAtual + 1, 1)
              }
            });

            if (faturaExistente) {
              logger.debug(`Fatura já existe para subscription ${subscription._id} neste mês`);
              continue;
            }

            // Gerar fatura
            await InvoiceService.gerarFatura(
              subscription._id,
              dataVencimento
            );

            geradas++;
            logger.info(`Fatura gerada para subscription ${subscription._id}`);
          }
        } catch (error) {
          erros++;
          logger.error(`Erro ao gerar fatura para subscription ${subscription._id}`, {
            error: error.message
          });
        }
      }

      // Marcar faturas vencidas
      const vencidas = await InvoiceService.marcarFaturasVencidas();

      logger.info('Geração de faturas mensais concluída', {
        total_subscriptions: subscriptions.length,
        geradas,
        erros,
        vencidas
      });

      return {
        success: true,
        geradas,
        erros,
        vencidas
      };
    } catch (error) {
      logger.error('Erro ao gerar faturas mensais', { error: error.message });
      throw error;
    }
  }

  /**
   * Executa o job (pode ser chamado por cron)
   */
  static async executar() {
    try {
      // Conectar ao MongoDB se ainda não estiver conectado
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(process.env.MONGO_URI);
      }

      await this.gerarFaturasMensais();

      logger.info('Job de geração de faturas executado com sucesso');
    } catch (error) {
      logger.error('Erro ao executar job de geração de faturas', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = InvoiceGenerationJob;

// Se executado diretamente (node job-generate-invoices.js)
if (require.main === module) {
  InvoiceGenerationJob.executar()
    .then(() => {
      console.log('✅ Job concluído com sucesso');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro ao executar job:', error);
      process.exit(1);
    });
}
