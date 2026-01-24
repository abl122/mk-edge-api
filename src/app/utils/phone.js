/**
 * Utilitários para formatação de números de telefone
 * 
 * Formatos suportados:
 * - SMS: 92991424261 (sem 55, com 9º dígito)
 * - Z-API: 559291424261 (com 55, sem 9º dígito)
 */

/**
 * Remove toda formatação do número (espaços, parênteses, hífens, etc)
 * @param {string} phone - Número com ou sem formatação
 * @returns {string} Apenas dígitos
 */
function cleanPhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Formata número para SMS (92991424261)
 * - Remove 55 se houver
 * - Mantém o 9º dígito
 * - Adiciona 9º dígito se não houver
 * 
 * @param {string} phone - Número em qualquer formato
 * @returns {string} Formato: DDNNNNNNNNN (ex: 92991424261)
 * 
 * @example
 * formatPhoneForSMS('5592991424261')  // '92991424261'
 * formatPhoneForSMS('559291424261')   // '92991424261' (adiciona 9º dígito)
 * formatPhoneForSMS('92991424261')    // '92991424261'
 * formatPhoneForSMS('(92) 99142-4261') // '92991424261'
 */
function formatPhoneForSMS(phone) {
  const cleaned = cleanPhone(phone);
  
  if (!cleaned) {
    throw new Error('Número de telefone inválido');
  }

  let number = cleaned;

  // Remove 55 se houver
  if (number.startsWith('55')) {
    number = number.substring(2);
  }

  // Verifica se tem DDD (pelo menos 10 dígitos restantes)
  if (number.length < 10) {
    throw new Error('Número de telefone inválido - muito curto');
  }

  // Extrai DDD e número local
  const ddd = number.substring(0, 2);
  const localNumber = number.substring(2);

  // Se número local tem 8 dígitos, adiciona o 9º dígito
  if (localNumber.length === 8) {
    return `${ddd}9${localNumber}`;
  }

  // Se tem 9 dígitos, já está correto
  if (localNumber.length === 9) {
    return `${ddd}${localNumber}`;
  }

  throw new Error('Número de telefone inválido - tamanho incorreto');
}

/**
 * Formata número para Z-API (559291424261)
 * - Adiciona 55 se não houver
 * - Remove o 9º dígito se houver
 * 
 * @param {string} phone - Número em qualquer formato
 * @returns {string} Formato: 55DDNNNNNNNN (ex: 559291424261)
 * 
 * @example
 * formatPhoneForZAPI('5592991424261')  // '559291424261'
 * formatPhoneForZAPI('559291424261')   // '559291424261'
 * formatPhoneForZAPI('92991424261')    // '559291424261'
 * formatPhoneForZAPI('(92) 99142-4261') // '559291424261'
 */
function formatPhoneForZAPI(phone) {
  const cleaned = cleanPhone(phone);
  
  if (!cleaned) {
    throw new Error('Número de telefone inválido');
  }

  let number = cleaned;
  let hasCountryCode = false;

  // Verifica se já tem o código do país (55)
  if (number.startsWith('55')) {
    hasCountryCode = true;
    number = number.substring(2);
  }

  // Verifica se tem DDD (pelo menos 10 dígitos restantes)
  if (number.length < 10) {
    throw new Error('Número de telefone inválido - muito curto');
  }

  // Extrai DDD e número local
  const ddd = number.substring(0, 2);
  const localNumber = number.substring(2);

  // Se número local tem 9 dígitos (com 9º dígito), remove o 9º
  let finalNumber;
  if (localNumber.length === 9) {
    // Remove o 9º dígito (primeiro dígito do número local)
    finalNumber = localNumber.substring(1);
  } else if (localNumber.length === 8) {
    // Já está sem o 9º dígito
    finalNumber = localNumber;
  } else {
    throw new Error('Número de telefone inválido - tamanho incorreto');
  }

  // Retorna com código do país
  return `55${ddd}${finalNumber}`;
}

/**
 * Valida se um número é válido para celular brasileiro
 * @param {string} phone - Número a validar
 * @returns {boolean}
 */
function isValidBrazilianPhone(phone) {
  try {
    const cleaned = cleanPhone(phone);
    
    // Remove 55 se houver
    const withoutCountry = cleaned.startsWith('55') 
      ? cleaned.substring(2) 
      : cleaned;

    // Deve ter 10 ou 11 dígitos (DDD + número)
    if (withoutCountry.length !== 10 && withoutCountry.length !== 11) {
      return false;
    }

    // DDD deve estar entre 11 e 99
    const ddd = parseInt(withoutCountry.substring(0, 2));
    if (ddd < 11 || ddd > 99) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

module.exports = {
  cleanPhone,
  formatPhoneForSMS,
  formatPhoneForZAPI,
  isValidBrazilianPhone
};
