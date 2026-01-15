<?php
/**
 * MK-Edge Agent API
 * 
 * Este é o arquivo principal do agente MK-Edge que funciona como proxy
 * entre o ZAPI/Whatsapp e o dashboard central.
 * 
 * Local de instalação: /opt/mk-auth/admin/addons/mk-edge/
 * 
 * @version 1.0.0
 * @license MIT
 */

// ============================================================================
// CONFIGURAÇÕES INICIAIS
// ============================================================================

error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Define diretório de log
$log_dir = dirname(__FILE__) . '/logs';
if (!is_dir($log_dir)) {
    mkdir($log_dir, 0755, true);
}
ini_set('error_log', $log_dir . '/errors.log');

// Carrega configurações
require_once dirname(__FILE__) . '/config.php';

// Headers
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Tenant-ID');

// Método OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ============================================================================
// CONSTANTES E VARIÁVEIS GLOBAIS
// ============================================================================

define('API_VERSION', '1.0.0');
define('AGENT_NAME', 'MK-Edge');

// Carrega config.json se existir
$config_file = dirname(__FILE__) . '/config.json';
$agent_config = [];
if (file_exists($config_file)) {
    $json_content = file_get_contents($config_file);
    $agent_config = json_decode($json_content, true);
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Log de eventos
 */
function log_event($action, $status, $details = []) {
    global $agent_config;
    
    $log_entry = [
        'timestamp' => date('Y-m-d H:i:s'),
        'tenant_id' => $agent_config['tenant_id'] ?? 'unknown',
        'action' => $action,
        'status' => $status,
        'details' => $details,
        'remote_ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown'
    ];
    
    $log_file = dirname(__FILE__) . '/logs/events.log';
    file_put_contents($log_file, json_encode($log_entry) . "\n", FILE_APPEND);
}

/**
 * Resposta JSON padrão
 */
function response($success, $message, $data = null, $code = 200) {
    http_response_code($code);
    echo json_encode([
        'success' => $success,
        'message' => $message,
        'data' => $data,
        'timestamp' => date('c'),
        'version' => API_VERSION
    ]);
    exit;
}

/**
 * Valida Tenant ID
 */
function validate_tenant_id() {
    global $agent_config;
    
    // Verifica header X-Tenant-ID
    $header_tenant_id = $_SERVER['HTTP_X_TENANT_ID'] ?? '';
    $config_tenant_id = $agent_config['tenant_id'] ?? '';
    
    if (empty($header_tenant_id)) {
        response(false, 'Tenant ID não informado no header X-Tenant-ID', null, 400);
    }
    
    if ($header_tenant_id !== $config_tenant_id) {
        log_event('auth', 'failed', ['reason' => 'tenant_id_mismatch']);
        response(false, 'Tenant ID inválido', null, 403);
    }
    
    return true;
}

/**
 * Valida token de autenticação
 */
function validate_token() {
    global $agent_config;
    
    $auth_header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    
    if (empty($auth_header)) {
        response(false, 'Token não informado no header Authorization', null, 401);
    }
    
    // Bearer token format
    if (preg_match('/Bearer\s+(\S+)/', $auth_header, $matches)) {
        $token = $matches[1];
        
        // Validar token contra configuração
        if (empty($agent_config['api_token'])) {
            // Token ainda não configurado
            log_event('auth', 'warning', ['reason' => 'no_token_configured']);
            return true; // Permitir na primeira execução
        }
        
        if ($token === $agent_config['api_token']) {
            return true;
        }
    }
    
    response(false, 'Token inválido', null, 401);
}

/**
 * Parse da rota da API
 */
function parse_route() {
    $request_uri = $_SERVER['REQUEST_URI'] ?? '/';
    $request_uri = parse_url($request_uri, PHP_URL_PATH);
    
    // Remove o prefixo do diretório
    $install_path = dirname(__FILE__);
    $base_path = '/opt/mk-auth/admin/addons/mk-edge';
    
    if (strpos($request_uri, $base_path) === 0) {
        $request_uri = substr($request_uri, strlen($base_path));
    }
    
    // Remove /api se existir
    if (strpos($request_uri, '/api') === 0) {
        $request_uri = substr($request_uri, 4);
    }
    
    $parts = array_filter(explode('/', $request_uri));
    
    return [
        'method' => $_SERVER['REQUEST_METHOD'] ?? 'GET',
        'parts' => array_values($parts),
        'query' => $_GET ?? [],
        'body' => file_get_contents('php://input')
    ];
}

// ============================================================================
// ROTAS DE SAÚDE E STATUS
// ============================================================================

$route = parse_route();

// GET /health - Health check
if ($route['method'] === 'GET' && count($route['parts']) === 0 || (count($route['parts']) === 1 && $route['parts'][0] === 'health')) {
    log_event('health_check', 'success');
    response(true, 'Agent is running', [
        'agent' => AGENT_NAME,
        'version' => API_VERSION,
        'status' => 'active',
        'tenant_id' => $agent_config['tenant_id'] ?? null,
        'installed_at' => $agent_config['installed_at'] ?? null,
        'uptime' => round(microtime(true) * 1000) . 'ms'
    ]);
}

// ============================================================================
// ROTAS AUTENTICADAS
// ============================================================================

// GET /status - Status do agente
if ($route['method'] === 'GET' && count($route['parts']) === 1 && $route['parts'][0] === 'status') {
    validate_tenant_id();
    validate_token();
    
    $status = [
        'agent' => AGENT_NAME,
        'version' => API_VERSION,
        'status' => 'active',
        'tenant_id' => $agent_config['tenant_id'] ?? null,
        'email' => $agent_config['email'] ?? null,
        'installed_at' => $agent_config['installed_at'] ?? null,
        'last_activity' => file_exists($log_dir . '/events.log') ? filemtime($log_dir . '/events.log') : null,
        'php_version' => phpversion(),
        'os' => php_uname('s'),
        'timestamp' => date('c')
    ];
    
    log_event('status_check', 'success');
    response(true, 'Agent status retrieved', $status);
}

// POST /webhook - Receber webhooks do ZAPI/Whatsapp
if ($route['method'] === 'POST' && count($route['parts']) === 1 && $route['parts'][0] === 'webhook') {
    validate_tenant_id();
    
    $body = json_decode($route['body'], true);
    
    if (empty($body)) {
        response(false, 'Corpo da requisição vazio', null, 400);
    }
    
    // Log do webhook recebido
    $webhook_id = md5(json_encode($body) . time());
    log_event('webhook_received', 'success', [
        'webhook_id' => $webhook_id,
        'type' => $body['type'] ?? 'unknown'
    ]);
    
    // Aqui você processaria o webhook
    // Por exemplo, enviar para o dashboard central
    
    response(true, 'Webhook received and queued for processing', [
        'webhook_id' => $webhook_id,
        'type' => $body['type'] ?? 'unknown',
        'processed_at' => date('c')
    ]);
}

// POST /messages - Enviar mensagens via ZAPI
if ($route['method'] === 'POST' && count($route['parts']) === 1 && $route['parts'][0] === 'messages') {
    validate_tenant_id();
    validate_token();
    
    $body = json_decode($route['body'], true);
    
    if (empty($body['phone']) || empty($body['message'])) {
        response(false, 'Phone e message são obrigatórios', null, 400);
    }
    
    // Aqui você chamaria o ZAPI para enviar mensagem
    $message_id = md5($body['phone'] . $body['message'] . time());
    
    log_event('message_sent', 'success', [
        'message_id' => $message_id,
        'phone' => $body['phone']
    ]);
    
    response(true, 'Message queued for sending', [
        'message_id' => $message_id,
        'phone' => $body['phone'],
        'status' => 'queued'
    ]);
}

// PUT /config - Atualizar configuração
if ($route['method'] === 'PUT' && count($route['parts']) === 1 && $route['parts'][0] === 'config') {
    validate_tenant_id();
    validate_token();
    
    $body = json_decode($route['body'], true);
    
    if (empty($body)) {
        response(false, 'Corpo da requisição vazio', null, 400);
    }
    
    // Atualizar config.json
    $config_file = dirname(__FILE__) . '/config.json';
    $updated_config = array_merge($agent_config, $body);
    
    if (file_put_contents($config_file, json_encode($updated_config, JSON_PRETTY_PRINT))) {
        log_event('config_updated', 'success', ['keys' => array_keys($body)]);
        response(true, 'Configuration updated successfully', $updated_config);
    } else {
        response(false, 'Falha ao atualizar configuração', null, 500);
    }
}

// GET /logs - Consultar logs
if ($route['method'] === 'GET' && count($route['parts']) === 1 && $route['parts'][0] === 'logs') {
    validate_tenant_id();
    validate_token();
    
    $limit = intval($route['query']['limit'] ?? 100);
    $events_log = dirname(__FILE__) . '/logs/events.log';
    
    $logs = [];
    if (file_exists($events_log)) {
        $lines = file($events_log, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $logs = array_map(function($line) {
            return json_decode($line, true);
        }, array_slice($lines, -$limit));
    }
    
    response(true, 'Logs retrieved', $logs);
}

// ============================================================================
// ROTA 404
// ============================================================================

response(false, 'Rota não encontrada', [
    'method' => $route['method'],
    'path' => implode('/', $route['parts']),
    'available_endpoints' => [
        'GET /health',
        'GET /status',
        'POST /webhook',
        'POST /messages',
        'PUT /config',
        'GET /logs'
    ]
], 404);
