// API Base URL
const API_URL = '/api';

// Global state
let authToken = localStorage.getItem('admin_token');
let currentTenantId = null;
let allTenants = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    if (!authToken) {
        redirectToLogin();
        return;
    }

    // Load initial data
    loadDashboard();
    setupEventListeners();
});

// ============ NAVIGATION ============

function showSection(sectionId, event) {
    event?.preventDefault();
    
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show selected section
    document.getElementById(sectionId).classList.add('active');
    
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    event?.target.closest('.nav-link')?.classList.add('active');
    
    // Load data for section
    switch(sectionId) {
        case 'dashboard':
            refreshDashboard();
            break;
        case 'tenants':
            loadTenants();
            break;
        case 'plans':
            loadPlans();
            break;
    }
    
    // Close sidebar on mobile
    if (window.innerWidth < 768) {
        toggleSidebar();
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

// ============ DASHBOARD ============

async function loadDashboard() {
    try {
        const response = await fetch(`${API_URL}/tenants`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            if (response.status === 401) redirectToLogin();
            throw new Error('Falha ao carregar tenants');
        }

        const result = await response.json();
        allTenants = result.data || result; // Suporta tanto {data: []} quanto [] direto
        updateDashboardStats();
        loadRecentTenants();

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showToast('Erro ao carregar dashboard', 'error');
    }
}

function refreshDashboard() {
    loadDashboard();
}

function updateDashboardStats() {
    const active = allTenants.filter(t => t.assinatura?.ativa).length;
    const totalRevenue = allTenants.reduce((sum, t) => sum + (t.assinatura?.valor_mensal || 0), 0);
    const inactive = allTenants.filter(t => !t.assinatura?.ativa).length;

    document.getElementById('totalTenants').textContent = allTenants.length;
    document.getElementById('activeTenants').textContent = active;
    document.getElementById('totalRevenue').textContent = `R$ ${totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('inactiveCount').textContent = inactive;

    // Update user display
    const user = JSON.parse(localStorage.getItem('admin_user') || '{}');
    document.getElementById('userDisplay').textContent = user.nome || 'Admin';
}

function loadRecentTenants() {
    const recent = allTenants.slice(0, 5);
    const container = document.getElementById('recentTenants');

    if (recent.length === 0) {
        container.innerHTML = '<p class="no-data">Nenhum provedor cadastrado</p>';
        return;
    }

    container.innerHTML = recent.map(tenant => `
        <div class="tenant-card">
            <div class="tenant-header">
                <h3>${tenant.provedor.nome}</h3>
                <span class="badge ${tenant.assinatura?.ativa ? 'badge-success' : 'badge-danger'}">
                    ${tenant.assinatura?.ativa ? 'Ativo' : 'Inativo'}
                </span>
            </div>
            <p><strong>CNPJ:</strong> ${tenant.provedor.cnpj}</p>
            <p><strong>Domínio:</strong> ${tenant.provedor.dominio}</p>
            <p><strong>Plano:</strong> ${tenant.assinatura?.plano || 'N/A'}</p>
            <div class="tenant-actions">
                <button class="btn btn-sm btn-primary" onclick="editTenant('${tenant._id}')">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteTenant('${tenant._id}')">
                    <i class="fas fa-trash"></i> Deletar
                </button>
            </div>
        </div>
    `).join('');
}

// ============ TENANTS MANAGEMENT ============

async function loadTenants() {
    try {
        const response = await fetch(`${API_URL}/tenants`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            if (response.status === 401) redirectToLogin();
            throw new Error('Falha ao carregar tenants');
        }

        const result = await response.json();
        allTenants = result.data || result; // Suporta tanto {data: []} quanto [] direto
        renderTenantsTable(allTenants);

    } catch (error) {
        console.error('Error loading tenants:', error);
        showToast('Erro ao carregar provedores', 'error');
    }
}

function renderTenantsTable(tenants) {
    const tbody = document.getElementById('tenantsTableBody');

    if (tenants.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-data">Nenhum provedor encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = tenants.map(tenant => `
        <tr>
            <td><strong>${tenant.provedor.nome}</strong></td>
            <td>${tenant.provedor.cnpj}</td>
            <td>${tenant.provedor.dominio}</td>
            <td>${tenant.assinatura?.plano || 'N/A'}</td>
            <td>
                <span class="badge ${tenant.assinatura?.ativa ? 'badge-success' : 'badge-danger'}">
                    ${tenant.assinatura?.ativa ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td class="actions">
                <button class="btn btn-sm btn-primary" onclick="editTenant('${tenant._id}')">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteTenant('${tenant._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function filterTenants(searchTerm = '') {
    const status = document.getElementById('statusFilter')?.value || '';
    
    let filtered = allTenants;

    if (searchTerm) {
        filtered = filtered.filter(t =>
            t.provedor.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.provedor.cnpj.includes(searchTerm) ||
            t.provedor.dominio.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    if (status) {
        const isActive = status === 'active';
        filtered = filtered.filter(t => t.assinatura?.ativa === isActive);
    }

    renderTenantsTable(filtered);
}

function openNewTenantModal() {
    currentTenantId = null;
    document.getElementById('modalTitle').textContent = 'Novo Provedor';
    document.getElementById('tenantForm').reset();
    document.getElementById('tenantModal').classList.add('active');
}

function closeTenantModal() {
    document.getElementById('tenantModal').classList.remove('active');
    currentTenantId = null;
}

async function editTenant(tenantId) {
    try {
        const response = await fetch(`${API_URL}/tenants/${tenantId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Falha ao carregar tenant');

        const tenant = await response.json();
        currentTenantId = tenantId;

        // Populate form
        document.getElementById('tenantName').value = tenant.provedor.nome;
        document.getElementById('tenantRazao').value = tenant.provedor.razao_social;
        document.getElementById('tenantCnpj').value = tenant.provedor.cnpj;
        document.getElementById('tenantDomain').value = tenant.provedor.dominio;
        document.getElementById('tenantEmail').value = tenant.provedor.email;
        document.getElementById('tenantPhone').value = tenant.provedor.telefone || '';
        document.getElementById('tenantPlan').value = tenant.assinatura?.plano || '';
        document.getElementById('tenantColorPrimary').value = tenant.provedor.cores?.primaria || '#6366f1';
        document.getElementById('tenantColorSecondary').value = tenant.provedor.cores?.secundaria || '#ec4899';
        document.getElementById('agenteUrl').value = tenant.agente?.url || '';
        document.getElementById('agenteTimeout').value = tenant.agente?.config?.timeout || 30;
        document.getElementById('agenteMaxRetries').value = tenant.agente?.config?.max_retries || 3;

        document.getElementById('modalTitle').textContent = 'Editar Provedor';
        document.getElementById('tenantModal').classList.add('active');

    } catch (error) {
        console.error('Error editing tenant:', error);
        showToast('Erro ao carregar provedor', 'error');
    }
}

async function saveTenant(event) {
    event.preventDefault();

    const tenantData = {
        provedor: {
            nome: document.getElementById('tenantName').value,
            razao_social: document.getElementById('tenantRazao').value,
            cnpj: document.getElementById('tenantCnpj').value,
            dominio: document.getElementById('tenantDomain').value,
            email: document.getElementById('tenantEmail').value,
            telefone: document.getElementById('tenantPhone').value,
            cores: {
                primaria: document.getElementById('tenantColorPrimary').value,
                secundaria: document.getElementById('tenantColorSecondary').value
            }
        },
        assinatura: {
            plano: document.getElementById('tenantPlan').value,
            ativa: true,
            valor_mensal: getPlanPrice(document.getElementById('tenantPlan').value)
        },
        agente: {
            url: document.getElementById('agenteUrl').value,
            ativo: true,
            config: {
                timeout: parseInt(document.getElementById('agenteTimeout').value),
                max_retries: parseInt(document.getElementById('agenteMaxRetries').value)
            }
        }
    };

    try {
        const url = currentTenantId ? `${API_URL}/tenants/${currentTenantId}` : `${API_URL}/tenants`;
        const method = currentTenantId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(tenantData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao salvar provedor');
        }

        showToast(currentTenantId ? 'Provedor atualizado com sucesso!' : 'Provedor criado com sucesso!', 'success');
        closeTenantModal();
        loadTenants();

    } catch (error) {
        console.error('Error saving tenant:', error);
        showToast(error.message || 'Erro ao salvar provedor', 'error');
    }
}

async function deleteTenant(tenantId) {
    if (!confirm('Tem certeza que deseja deletar este provedor? Esta ação não pode ser desfeita.')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/tenants/${tenantId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) throw new Error('Erro ao deletar provedor');

        showToast('Provedor deletado com sucesso!', 'success');
        loadTenants();

    } catch (error) {
        console.error('Error deleting tenant:', error);
        showToast('Erro ao deletar provedor', 'error');
    }
}

function getPlanPrice(plan) {
    const prices = {
        'basic': 299,
        'professional': 599,
        'enterprise': 999
    };
    return prices[plan] || 0;
}

// ============ AUTHENTICATION ============

async function changePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showToast('Novas senhas não conferem', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                senha_atual: currentPassword,
                nova_senha: newPassword
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Erro ao alterar senha');
        }

        showToast('Senha alterada com sucesso!', 'success');
        closePasswordModal();

    } catch (error) {
        console.error('Error changing password:', error);
        showToast(error.message || 'Erro ao alterar senha', 'error');
    }
}

function openChangePasswordModal() {
    document.getElementById('passwordForm').reset();
    document.getElementById('passwordModal').classList.add('active');
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('active');
}

function toggleAdminPasswordVisibility(fieldId) {
    const field = document.getElementById(fieldId);
    const button = event.target.closest('.password-toggle');
    const icon = button.querySelector('i');
    
    if (field.type === 'password') {
        field.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        field.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    redirectToLogin();
}

function redirectToLogin() {
    window.location.href = '/';
}

// ============ UI UTILITIES ============

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

function setupEventListeners() {
    // Close modals on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTenantModal();
            closePasswordModal();
        }
    });

    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// Responsive sidebar
window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
        document.getElementById('sidebar').classList.remove('active');
    }
});
// ============ INTEGRAÇÕES ============

async function testAllIntegrations() {
    showToast('Testando integrações...', 'info');
    await Promise.all([testEfi(), testZapi()]);
}

async function testEfi() {
    try {
        const response = await fetch(`${API_URL}/integrations/efi/test`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            document.getElementById('efi-status').textContent = 'Conectado ✓';
            document.getElementById('efi-env').textContent = data.environment || '-';
            document.getElementById('efi-badge').textContent = 'Conectado';
            document.getElementById('efi-badge').style.background = '#10b981';
            showToast('EFI conectado com sucesso!', 'success');
        } else {
            document.getElementById('efi-status').textContent = 'Erro de conexão';
            document.getElementById('efi-badge').textContent = 'Erro';
            document.getElementById('efi-badge').style.background = '#ef4444';
            showToast(data.message || 'Erro ao conectar EFI', 'error');
        }
    } catch (error) {
        console.error('Erro ao testar EFI:', error);
        document.getElementById('efi-status').textContent = 'Erro';
        showToast('Erro ao testar EFI', 'error');
    }
}

async function testZapi() {
    try {
        const response = await fetch(`${API_URL}/integrations/zapi/test`, {
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (data.success) {
            document.getElementById('zapi-status').textContent = 'Conectado ✓';
            document.getElementById('zapi-instance').textContent = data.instance || '-';
            document.getElementById('zapi-badge').textContent = 'Conectado';
            document.getElementById('zapi-badge').style.background = '#10b981';
            showToast('Z-API conectada com sucesso!', 'success');
        } else {
            document.getElementById('zapi-status').textContent = 'Erro de conexão';
            document.getElementById('zapi-badge').textContent = 'Erro';
            document.getElementById('zapi-badge').style.background = '#ef4444';
            showToast(data.message || 'Erro ao conectar Z-API', 'error');
        }
    } catch (error) {
        console.error('Erro ao testar Z-API:', error);
        document.getElementById('zapi-status').textContent = 'Erro';
        showToast('Erro ao testar Z-API', 'error');
    }
}

function openEfiConfig() {
    document.getElementById('efiModal').classList.add('active');
}

function closeEfiModal() {
    document.getElementById('efiModal').classList.remove('active');
}

async function saveEfiConfig(e) {
    e.preventDefault();
    
    const config = {
        client_id: document.getElementById('efiClientId').value,
        client_secret: document.getElementById('efiClientSecret').value,
        pix_key: document.getElementById('efiPixKey').value,
        sandbox: document.getElementById('efiSandbox').checked
    };

    try {
        const response = await fetch(`${API_URL}/integrations/efi/config`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(config)
        });
        const data = await response.json();

        if (data.success) {
            showToast('Configurações EFI salvas com sucesso!', 'success');
            closeEfiModal();
            testEfi();
        } else {
            showToast(data.error || 'Erro ao salvar configurações', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        showToast('Erro ao salvar configurações', 'error');
    }
}

function openZapiConfig() {
    document.getElementById('zapiModal').classList.add('active');
}

function closeZapiModal() {
    document.getElementById('zapiModal').classList.remove('active');
}

async function saveZapiConfig(e) {
    e.preventDefault();
    
    const config = {
        instance: document.getElementById('zapiInstance').value,
        token: document.getElementById('zapiToken').value,
        security_token: document.getElementById('zapiSecurityToken').value
    };

    try {
        const response = await fetch(`${API_URL}/integrations/zapi/config`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(config)
        });
        const data = await response.json();

        if (data.success) {
            showToast('Configurações Z-API salvas com sucesso!', 'success');
            closeZapiModal();
            testZapi();
        } else {
            showToast(data.error || 'Erro ao salvar configurações', 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        showToast('Erro ao salvar configurações', 'error');
    }
}

function viewWebhookLogs() {
    showToast('Carregando logs...', 'info');
    window.open('#', '_blank');
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copiado para a área de transferência!', 'success');
    });
}

// ============ PLANS MANAGEMENT ============

async function loadPlans() {
    try {
        const response = await fetch(`${API_URL}/plans`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Erro ao carregar planos');
        }
        
        renderPlanCards(data.plans || []);
    } catch (error) {
        console.error('Erro ao carregar planos:', error);
        showToast('Erro ao carregar planos: ' + error.message, 'error');
        document.getElementById('plansContainer').innerHTML = 
            '<p style="text-align: center; color: #e74c3c; grid-column: 1/-1;">Erro ao carregar planos</p>';
    }
}

function renderPlanCards(plans) {
    const container = document.getElementById('plansContainer');
    
    if (!plans || plans.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; grid-column: 1/-1;">Nenhum plano cadastrado ainda</p>';
        return;
    }
    
    container.innerHTML = plans.map(plan => `
        <div class="card" style="border-left: 4px solid ${plan.cor || '#3498db'};">
            <div class="card-header">
                <h3>${plan.nome}</h3>
                <div>
                    ${plan.destaque ? '<span class="badge" style="background: #f39c12;">Destaque</span>' : ''}
                    <span class="badge" style="background: ${plan.ativo ? '#27ae60' : '#95a5a6'};">
                        ${plan.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                </div>
            </div>
            <div class="card-body">
                <p><strong>R$ ${parseFloat(plan.valor).toFixed(2)}</strong> / ${plan.periodo}</p>
                ${plan.descricao ? `<p style="font-size: 0.9em; color: #666;">${plan.descricao}</p>` : ''}
                
                ${plan.dias_trial ? `<p style="font-size: 0.85em; color: #3498db;"><i class="fas fa-gift"></i> ${plan.dias_trial} dias de teste</p>` : ''}
                
                ${plan.limite_clientes ? `<p style="font-size: 0.85em; color: #666;"><i class="fas fa-users"></i> Até ${plan.limite_clientes} clientes</p>` : ''}
                
                ${plan.recursos && plan.recursos.length > 0 ? `
                    <ul style="font-size: 0.9em; margin-top: 10px; padding-left: 20px;">
                        ${plan.recursos.slice(0, 3).map(r => `<li>${r}</li>`).join('')}
                        ${plan.recursos.length > 3 ? `<li>+ ${plan.recursos.length - 3} mais</li>` : ''}
                    </ul>
                ` : ''}
            </div>
            <div class="card-footer" style="display: flex; gap: 5px; justify-content: space-between;">
                <button class="btn btn-sm btn-secondary" onclick="editPlan('${plan._id}')">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="btn btn-sm ${plan.ativo ? 'btn-warning' : 'btn-success'}" 
                    onclick="togglePlanStatus('${plan._id}')">
                    <i class="fas fa-${plan.ativo ? 'pause' : 'play'}"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deletePlan('${plan._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function openNewPlanModal() {
    document.getElementById('planModalTitle').textContent = 'Novo Plano';
    document.getElementById('planForm').reset();
    document.getElementById('planAtivo').checked = true;
    document.getElementById('planCor').value = '#3498db';
    document.getElementById('planDiasTrial').value = 7;
    document.getElementById('planForm').onsubmit = savePlan;
    document.getElementById('planModal').classList.add('active');
}

function closePlanModal() {
    document.getElementById('planModal').classList.remove('active');
    document.getElementById('planForm').reset();
}

async function editPlan(planId) {
    try {
        const response = await fetch(`${API_URL}/plans/${planId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Erro ao carregar plano');
        }
        
        const plan = data.plan;
        document.getElementById('planModalTitle').textContent = 'Editar Plano';
        document.getElementById('planNome').value = plan.nome;
        document.getElementById('planSlug').value = plan.slug;
        document.getElementById('planDescricao').value = plan.descricao || '';
        document.getElementById('planValor').value = plan.valor;
        document.getElementById('planPeriodo').value = plan.periodo;
        document.getElementById('planDiasTrial').value = plan.dias_trial || 7;
        document.getElementById('planLimiteClientes').value = plan.limite_clientes || '';
        document.getElementById('planRecursos').value = (plan.recursos || []).join('\n');
        document.getElementById('planCor').value = plan.cor || '#3498db';
        document.getElementById('planOrdem').value = plan.ordem || 0;
        document.getElementById('planDestaque').checked = plan.destaque || false;
        document.getElementById('planAtivo').checked = plan.ativo !== false;
        document.getElementById('planRecorrente').checked = plan.recorrente || false;
        
        document.getElementById('planForm').onsubmit = (e) => updatePlan(e, planId);
        document.getElementById('planModal').classList.add('active');
    } catch (error) {
        console.error('Erro ao carregar plano:', error);
        showToast('Erro: ' + error.message, 'error');
    }
}

async function savePlan(event) {
    event.preventDefault();
    
    const plan = {
        nome: document.getElementById('planNome').value,
        slug: document.getElementById('planSlug').value,
        descricao: document.getElementById('planDescricao').value,
        valor: parseFloat(document.getElementById('planValor').value),
        periodo: document.getElementById('planPeriodo').value,
        dias_trial: parseInt(document.getElementById('planDiasTrial').value) || 7,
        limite_clientes: document.getElementById('planLimiteClientes').value ? 
            parseInt(document.getElementById('planLimiteClientes').value) : null,
        recursos: document.getElementById('planRecursos').value
            .split('\n')
            .map(r => r.trim())
            .filter(r => r.length > 0),
        cor: document.getElementById('planCor').value,
        ordem: parseInt(document.getElementById('planOrdem').value) || 0,
        destaque: document.getElementById('planDestaque').checked,
        ativo: document.getElementById('planAtivo').checked,
        recorrente: document.getElementById('planRecorrente').checked
    };
    
    try {
        showToast('Salvando plano...', 'info');
        const response = await fetch(`${API_URL}/plans`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(plan)
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Erro ao salvar plano');
        }
        
        showToast('Plano criado com sucesso!', 'success');
        closePlanModal();
        loadPlans();
    } catch (error) {
        console.error('Erro ao salvar plano:', error);
        showToast('Erro ao salvar plano: ' + error.message, 'error');
    }
}

async function updatePlan(event, planId) {
    event.preventDefault();
    
    const plan = {
        nome: document.getElementById('planNome').value,
        slug: document.getElementById('planSlug').value,
        descricao: document.getElementById('planDescricao').value,
        valor: parseFloat(document.getElementById('planValor').value),
        periodo: document.getElementById('planPeriodo').value,
        dias_trial: parseInt(document.getElementById('planDiasTrial').value) || 7,
        limite_clientes: document.getElementById('planLimiteClientes').value ? 
            parseInt(document.getElementById('planLimiteClientes').value) : null,
        recursos: document.getElementById('planRecursos').value
            .split('\n')
            .map(r => r.trim())
            .filter(r => r.length > 0),
        cor: document.getElementById('planCor').value,
        ordem: parseInt(document.getElementById('planOrdem').value) || 0,
        destaque: document.getElementById('planDestaque').checked,
        ativo: document.getElementById('planAtivo').checked,
        recorrente: document.getElementById('planRecorrente').checked
    };
    
    try {
        showToast('Atualizando plano...', 'info');
        const response = await fetch(`${API_URL}/plans/${planId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(plan)
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Erro ao atualizar plano');
        }
        
        showToast('Plano atualizado com sucesso!', 'success');
        closePlanModal();
        loadPlans();
    } catch (error) {
        console.error('Erro ao atualizar plano:', error);
        showToast('Erro ao atualizar plano: ' + error.message, 'error');
    }
}

async function deletePlan(planId) {
    if (!confirm('Tem certeza que deseja deletar este plano?')) {
        return;
    }
    
    try {
        showToast('Deletando plano...', 'info');
        const response = await fetch(`${API_URL}/plans/${planId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Erro ao deletar plano');
        }
        
        showToast('Plano deletado com sucesso!', 'success');
        loadPlans();
    } catch (error) {
        console.error('Erro ao deletar plano:', error);
        showToast('Erro ao deletar plano: ' + error.message, 'error');
    }
}

async function togglePlanStatus(planId) {
    try {
        const response = await fetch(`${API_URL}/plans/${planId}/toggle`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Erro ao alterar status do plano');
        }
        
        showToast('Status do plano atualizado!', 'success');
        loadPlans();
    } catch (error) {
        console.error('Erro ao alterar status:', error);
        showToast('Erro ao alterar status: ' + error.message, 'error');
    }
}