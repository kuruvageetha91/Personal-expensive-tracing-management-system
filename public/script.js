
const $ = id => document.getElementById(id);

let categories = [];
let transactions = [];

const money = amount =>
    '₹' + Number(amount || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const escapeHTML = value =>
    String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);

async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Something went wrong');
    }

    return data;
}

function showMessage(message, isError = false) {
    $('authMessage').textContent = message;
    $('authMessage').style.color = isError ? '#dc3545' : '#15966d';
}

function showAuth(type) {
    $('loginForm').classList.toggle('hidden', type !== 'login');
    $('registerForm').classList.toggle('hidden', type !== 'register');

    $('loginTab').classList.toggle('active', type === 'login');
    $('registerTab').classList.toggle('active', type === 'register');

    showMessage('');
}

function fillMonths() {
    const monthNames = [
        'January', 'February', 'March', 'April',
        'May', 'June', 'July', 'August',
        'September', 'October', 'November', 'December'
    ];

    ['budgetMonth', 'reportMonth'].forEach(id => {
        $(id).innerHTML = monthNames.map((month, index) =>
            `<option value="${index + 1}">${month}</option>`
        ).join('');
    });

    const now = new Date();

    $('budgetMonth').value = now.getMonth() + 1;
    $('reportMonth').value = now.getMonth() + 1;
    $('budgetYear').value = now.getFullYear();
    $('reportYear').value = now.getFullYear();
    $('transactionDate').value = now.toLocaleDateString('en-CA');
    $('todayDate').textContent = now.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// LOGIN
$('loginForm').addEventListener('submit', async event => {
    event.preventDefault();

    try {
        const data = await api('/api/login', {
            method: 'POST',
            body: JSON.stringify({
                email: $('loginEmail').value.trim(),
                password: $('loginPassword').value
            })
        });

        await openDashboard(data.name);
    } catch (error) {
        showMessage(error.message, true);
    }
});

// REGISTER
$('registerForm').addEventListener('submit', async event => {
    event.preventDefault();

    try {
        const data = await api('/api/register', {
            method: 'POST',
            body: JSON.stringify({
                name: $('regName').value.trim(),
                email: $('regEmail').value.trim(),
                password: $('regPassword').value
            })
        });

        await openDashboard(data.name);
    } catch (error) {
        showMessage(error.message, true);
    }
});

// OPEN DASHBOARD
async function openDashboard(name) {
    $('authSection').classList.add('hidden');
    $('appSection').classList.remove('hidden');
    $('userName').textContent = name;

    await refreshDashboard();
}

// CHECK EXISTING SESSION
async function checkSession() {
    try {
        const user = await api('/api/me');
        await openDashboard(user.name);
    } catch {
        $('authSection').classList.remove('hidden');
        $('appSection').classList.add('hidden');
    }
}

// LOGOUT
$('logoutBtn').addEventListener('click', async () => {
    try {
        await api('/api/logout', { method: 'POST' });
        location.reload();
    } catch (error) {
        alert(error.message);
    }
});

// LOAD DASHBOARD DATA
async function refreshDashboard() {
    try {
        await loadCategories();
        await loadTransactions();
        await loadSummary();
        await loadReport();
    } catch (error) {
        alert(error.message);
    }
}

// LOAD CATEGORIES
async function loadCategories() {
    categories = await api('/api/categories');

    const type = $('transactionType').value;

    const available = categories.filter(
        category => category.category_type === type
    );

    $('categoryId').innerHTML =
        '<option value="">Select Category</option>' +
        available.map(category =>
            `<option value="${category.category_id}">
                ${escapeHTML(category.category_name)}
            </option>`
        ).join('');

    $('categoryList').innerHTML = categories.map(category =>
        `<span class="category-tag">
            ${escapeHTML(category.category_name)}
            <small>(${escapeHTML(category.category_type)})</small>
        </span>`
    ).join('');
}

// CHANGE CATEGORY WHEN TYPE CHANGES
$('transactionType').addEventListener('change', () => {
    loadCategories();
});

// ADD CATEGORY
$('categoryForm').addEventListener('submit', async event => {
    event.preventDefault();

    try {
        await api('/api/categories', {
            method: 'POST',
            body: JSON.stringify({
                category_name: $('categoryName').value.trim(),
                category_type: $('newCategoryType').value
            })
        });

        $('categoryForm').reset();
        await loadCategories();
        alert('Category added successfully!');
    } catch (error) {
        alert(error.message);
    }
});

// ADD OR UPDATE TRANSACTION
$('transactionForm').addEventListener('submit', async event => {
    event.preventDefault();

    const id = $('transactionId').value;

    const transaction = {
        category_id: Number($('categoryId').value),
        amount: Number($('amount').value),
        transaction_type: $('transactionType').value,
        description: $('description').value.trim(),
        transaction_date: $('transactionDate').value
    };

    try {
        await api(
            id ? `/api/transactions/${id}` : '/api/transactions',
            {
                method: id ? 'PUT' : 'POST',
                body: JSON.stringify(transaction)
            }
        );

        resetTransactionForm();
        await refreshDashboard();

        alert(id
            ? 'Transaction updated successfully!'
            : 'Transaction added successfully!'
        );

    } catch (error) {
        alert(error.message);
    }
});

// RESET TRANSACTION FORM
function resetTransactionForm() {
    $('transactionForm').reset();
    $('transactionId').value = '';
    $('transactionType').value = 'Expense';
    $('transactionDate').value = new Date().toLocaleDateString('en-CA');
    $('saveTransaction').textContent = 'Add Transaction';
    $('cancelEdit').classList.add('hidden');
    loadCategories();
}

// LOAD TRANSACTION HISTORY
async function loadTransactions() {
    transactions = await api('/api/transactions');

    const table = $('transactionTable');

    if (!transactions.length) {
        table.innerHTML =
            '<tr><td colspan="6">No transactions yet. Add your first transaction!</td></tr>';
        return;
    }

    table.innerHTML = transactions.map(t => `
        <tr>
            <td>${escapeHTML(new Date(t.transaction_date).toLocaleDateString('en-IN'))}</td>
            <td>${escapeHTML(t.category_name)}</td>
            <td class="${t.transaction_type === 'Income' ? 'type-income' : 'type-expense'}">
                ${escapeHTML(t.transaction_type)}
            </td>
            <td>${escapeHTML(t.description)}</td>
            <td>${money(t.amount)}</td>
            <td>
                <button class="action-btn edit-btn"
                    onclick="editTransaction(${Number(t.transaction_id)})">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="action-btn delete-btn"
                    onclick="deleteTransaction(${Number(t.transaction_id)})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// EDIT TRANSACTION
async function editTransaction(id) {
    const transaction = transactions.find(
        item => Number(item.transaction_id) === Number(id)
    );

    if (!transaction) return;

    $('transactionId').value = transaction.transaction_id;
    $('transactionType').value = transaction.transaction_type;

    await loadCategories();

    $('categoryId').value = transaction.category_id;
    $('amount').value = transaction.amount;
    $('description').value = transaction.description || '';

    const date = new Date(transaction.transaction_date);
    $('transactionDate').value =
        date.getFullYear() + '-' +
        String(date.getMonth() + 1).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0');

    $('saveTransaction').textContent = 'Update Transaction';
    $('cancelEdit').classList.remove('hidden');

    $('addTransaction').scrollIntoView({ behavior: 'smooth' });
}

// DELETE TRANSACTION
async function deleteTransaction(id) {
    if (!confirm('Are you sure you want to delete this transaction?')) {
        return;
    }

    try {
        await api(`/api/transactions/${id}`, {
            method: 'DELETE'
        });

        await refreshDashboard();
        alert('Transaction deleted successfully!');
    } catch (error) {
        alert(error.message);
    }
}

// DASHBOARD SUMMARY
async function loadSummary() {
    const data = await api('/api/summary');

    $('totalIncome').textContent = money(data.totalIncome);
    $('totalExpenses').textContent = money(data.totalExpenses);
    $('balance').textContent = money(data.balance);
}

// SAVE BUDGET
$('budgetForm').addEventListener('submit', async event => {
    event.preventDefault();

    try {
        await api('/api/budget', {
            method: 'POST',
            body: JSON.stringify({
                monthly_limit: Number($('monthlyLimit').value),
                budget_month: Number($('budgetMonth').value),
                budget_year: Number($('budgetYear').value)
            })
        });

        alert('Monthly budget saved successfully!');
        await loadReport();

    } catch (error) {
        alert(error.message);
    }
});

// MONTHLY REPORT
$('reportForm').addEventListener('submit', async event => {
    event.preventDefault();
    await loadReport();
});

async function loadReport() {
    const month = Number($('reportMonth').value);
    const year = Number($('reportYear').value);

    if (!month || !year) return;

    const data = await api(
        `/api/report?month=${month}&year=${year}`
    );

    const expenseRows = data.transactions.filter(
        item => item.transaction_type === 'Expense'
    );

    const income = data.transactions
        .filter(item => item.transaction_type === 'Income')
        .reduce((sum, item) => sum + Number(item.total), 0);

    const expenses = expenseRows.reduce(
        (sum, item) => sum + Number(item.total), 0
    );

    const remaining = data.monthlyBudget - expenses;

    $('reportSummary').innerHTML = `
        <div class="report-box">Income<strong>${money(income)}</strong></div>
        <div class="report-box">Expenses<strong>${money(expenses)}</strong></div>
        <div class="report-box">Budget<strong>${money(data.monthlyBudget)}</strong></div>
    `;

    $('budgetAmount').textContent = money(data.monthlyBudget);
    $('budgetSpent').textContent = money(expenses);
    $('budgetRemaining').textContent = money(remaining);

    const percentage = data.monthlyBudget > 0
        ? (expenses / data.monthlyBudget) * 100
        : 0;

    $('budgetProgress').style.width =
        Math.min(percentage, 100) + '%';

    $('budgetMessage').textContent =
        data.monthlyBudget === 0
            ? 'Set a monthly budget to track your spending.'
            : expenses > data.monthlyBudget
                ? 'Warning! You have exceeded your monthly budget.'
                : 'Good job! You are within your monthly budget.';

    if (!expenseRows.length) {
        $('reportChart').innerHTML =
            '<p>No expenses recorded for this month.</p>';
        return;
    }

    const max = Math.max(...expenseRows.map(
        item => Number(item.total)
    ));

    $('reportChart').innerHTML = expenseRows.map(item => `
        <div class="bar-row">
            <span>${escapeHTML(item.category_name)}</span>
            <div class="bar-track">
                <div class="bar" style="width:${Number(item.total) / max * 100}%"></div>
            </div>
            <strong>${money(item.total)}</strong>
        </div>
    `).join('');
}

// INITIALIZE
fillMonths();
checkSession();
