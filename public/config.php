<?php
/**
 * MK-Edge Agent Configuration
 * 
 * Arquivo de configuração do agente MK-Edge
 * Carregado automaticamente por api.php
 * 
 * @version 1.0.0
 */

// ============================================================================
// CONFIGURAÇÕES DO AGENTE
// ============================================================================

// Modo de debug (desativar em produção)
define('DEBUG_MODE', false);

// Fuso horário
date_default_timezone_set('America/Sao_Paulo');

// ============================================================================
// CONFIGURAÇÕES DE BANCO DE DADOS (OPCIONAL)
// ============================================================================

// Se você quiser manter logs localmente no banco de dados SQLite:
define('USE_LOCAL_DB', false);
define('LOCAL_DB_PATH', dirname(__FILE__) . '/mk-edge.db');

// Função auxiliar para conectar ao banco local
function get_local_db() {
    if (!USE_LOCAL_DB) return null;
    
    try {
        $db = new PDO('sqlite:' . LOCAL_DB_PATH);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        return $db;
    } catch (Exception $e) {
        error_log('Erro ao conectar ao banco local: ' . $e->getMessage());
        return null;
    }
}

// ============================================================================
// CONFIGURAÇÕES DE API CENTRAL (DASHBOARD)
// ============================================================================

// URL base do dashboard/API central
define('CENTRAL_API_URL', 'https://api.mkedge.com.br');

// Endpoints da API central
define('CENTRAL_ENDPOINTS', [
    'webhook_received' => '/api/agent/webhook',
    'message_sent' => '/api/agent/message',
    'status_update' => '/api/agent/status',
    'log_event' => '/api/agent/logs',
    'error_report' => '/api/agent/errors'
]);

// ============================================================================
// CONFIGURAÇÕES DO ZAPI/WHATSAPP
// ============================================================================

// URL do ZAPI (Z-API)
define('ZAPI_BASE_URL', 'https://api.z-api.io');

// Seu token ZAPI (será atualizado automaticamente após instalação)
define('ZAPI_TOKEN', getenv('ZAPI_TOKEN') ?: '');

// ID da instância ZAPI (será atualizado automaticamente após instalação)
define('ZAPI_INSTANCE_ID', getenv('ZAPI_INSTANCE_ID') ?: '');

// ============================================================================
// CONFIGURAÇÕES DE ARMAZENAMENTO
// ============================================================================

// Diretório para armazenar dados locais
define('DATA_DIR', dirname(__FILE__) . '/data');

// Diretório para logs
define('LOG_DIR', dirname(__FILE__) . '/logs');

// Criar diretórios se não existirem
function ensure_directories() {
    $dirs = [DATA_DIR, LOG_DIR];
    foreach ($dirs as $dir) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
    }
}
ensure_directories();

// ============================================================================
// CONFIGURAÇÕES DE SEGURANÇA
// ============================================================================

// Tokens de API válidos (será preenchido após primeira configuração)
define('VALID_TOKENS', [
    // 'seu-token-aqui'
]);

// IPs permitidos (deixe vazio para permitir todos)
define('ALLOWED_IPS', [
    // '192.168.1.1',
    // '10.0.0.0/8'
]);

// Taxa de limite (requisições por minuto)
define('RATE_LIMIT', 100);

// ============================================================================
// CONFIGURAÇÕES DE TIMEOUT
// ============================================================================

// Timeout para requisições HTTP (segundos)
define('HTTP_TIMEOUT', 30);

// Timeout para processamento de webhooks (segundos)
define('WEBHOOK_TIMEOUT', 60);

// ============================================================================
// CONFIGURAÇÕES DE RETENÇÃO DE DADOS
// ============================================================================

// Quantos dias manter logs locais
define('LOG_RETENTION_DAYS', 30);

// Quantos dias manter webhooks processados
define('WEBHOOK_RETENTION_DAYS', 7);

// Limpeza automática (a cada N requisições)
define('AUTO_CLEANUP_INTERVAL', 100);

// ============================================================================
// CONFIGURAÇÕES DE EMAIL
// ============================================================================

// Configurações de notificações por email
define('SEND_EMAIL_ALERTS', true);
define('ALERT_EMAIL', '');  // Será preenchido durante instalação
define('SMTP_HOST', getenv('SMTP_HOST') ?: 'localhost');
define('SMTP_PORT', getenv('SMTP_PORT') ?: 587);
define('SMTP_USER', getenv('SMTP_USER') ?: '');
define('SMTP_PASS', getenv('SMTP_PASS') ?: '');
define('SMTP_FROM', getenv('SMTP_FROM') ?: 'no-reply@mkedge.com.br');

// ============================================================================
// CONFIGURAÇÕES DE PROXY (se necessário)
// ============================================================================

// Use proxy para requisições externas?
define('USE_PROXY', false);
define('PROXY_HOST', getenv('PROXY_HOST') ?: '');
define('PROXY_PORT', getenv('PROXY_PORT') ?: 0);
define('PROXY_USER', getenv('PROXY_USER') ?: '');
define('PROXY_PASS', getenv('PROXY_PASS') ?: '');

// ============================================================================
// FUNÇÕES DE CONFIGURAÇÃO
// ============================================================================

/**
 * Faz uma requisição HTTP com tratamento de erros
 */
function make_request($method, $url, $data = null, $headers = []) {
    $ch = curl_init();
    
    // Configurações básicas
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, HTTP_TIMEOUT);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    
    // Headers
    $headers['User-Agent'] = 'MK-Edge/1.0.0';
    curl_setopt($ch, CURLOPT_HTTPHEADER, array_map(function($k, $v) {
        return "$k: $v";
    }, array_keys($headers), array_values($headers)));
    
    // Data
    if ($data) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }
    
    // Proxy
    if (USE_PROXY && PROXY_HOST) {
        curl_setopt($ch, CURLOPT_PROXY, PROXY_HOST . ':' . PROXY_PORT);
        if (PROXY_USER) {
            curl_setopt($ch, CURLOPT_PROXYUSERPWD, PROXY_USER . ':' . PROXY_PASS);
        }
    }
    
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    
    curl_close($ch);
    
    if ($error) {
        throw new Exception("cURL error: $error");
    }
    
    return [
        'code' => $http_code,
        'body' => $response,
        'data' => json_decode($response, true)
    ];
}

/**
 * Loga eventos no sistema
 */
function log_to_central($action, $status, $details = []) {
    // Enviar para API central se configurada
    if (defined('CENTRAL_API_URL')) {
        try {
            $log_entry = [
                'action' => $action,
                'status' => $status,
                'details' => $details,
                'timestamp' => date('c')
            ];
            
            // Fila local para envio posterior se houver erro
            $queue_file = LOG_DIR . '/central_queue.log';
            file_put_contents($queue_file, json_encode($log_entry) . "\n", FILE_APPEND);
        } catch (Exception $e) {
            error_log("Erro ao enviar log para central: " . $e->getMessage());
        }
    }
}

/**
 * Limpa arquivos antigos
 */
function cleanup_old_data() {
    $log_dir = LOG_DIR;
    
    if (!is_dir($log_dir)) return;
    
    $files = scandir($log_dir);
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') continue;
        
        $file_path = $log_dir . '/' . $file;
        $file_age = time() - filemtime($file_path);
        $max_age = LOG_RETENTION_DAYS * 86400;
        
        if ($file_age > $max_age) {
            @unlink($file_path);
        }
    }
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================

// Executar limpeza periodicamente
static $cleanup_counter = 0;
$cleanup_counter++;

if ($cleanup_counter % AUTO_CLEANUP_INTERVAL === 0) {
    cleanup_old_data();
}

// Retornar configuração carregada
return [
    'debug' => DEBUG_MODE,
    'version' => '1.0.0',
    'agent_name' => 'MK-Edge',
    'installed' => true,
    'timezone' => date_default_timezone_get()
];
