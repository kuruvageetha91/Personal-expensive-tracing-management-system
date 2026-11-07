
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./config/db');
const path = require('path');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

// Check login
function auth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ message: 'Please login first' });
    }
    next();
}

// HOME
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// REGISTER
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must contain at least 6 characters' });
        }

        const [existing] = await db.execute(
            'SELECT user_id FROM users WHERE email = ?', [email]
        );

        if (existing.length > 0) {
            return res.status(409).json({ message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.execute(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );

        const userId = result.insertId;

        const defaults = [
            ['Salary', 'Income'],
            ['Business', 'Income'],
            ['Food', 'Expense'],
            ['Shopping', 'Expense'],
            ['Travel', 'Expense'],
            ['Education', 'Expense'],
            ['Bills', 'Expense'],
            ['Health', 'Expense'],
            ['Other', 'Expense']
        ];

        for (const item of defaults) {
            await db.execute(
                'INSERT INTO categories (user_id, category_name, category_type) VALUES (?, ?, ?)',
                [userId, item[0], item[1]]
            );
        }

        req.session.userId = userId;
        req.session.userName = name;

        res.json({ message: 'Registration successful', name });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Registration failed' });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const [rows] = await db.execute(
            'SELECT * FROM users WHERE email = ?', [email]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = rows[0];
        const valid = await bcrypt.compare(password, user.password);

        if (!valid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        req.session.userId = user.user_id;
        req.session.userName = user.name;

        res.json({ message: 'Login successful', name: user.name });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Login failed' });
    }
});

// CHECK LOGIN STATUS
app.get('/api/me', auth, (req, res) => {
    res.json({ name: req.session.userName });
});

// LOGOUT
app.post('/api/logout', auth, (req, res) => {
    req.session.destroy(() => {
        res.json({ message: 'Logged out successfully' });
    });
});

// GET CATEGORIES
app.get('/api/categories', auth, async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM categories WHERE user_id = ? ORDER BY category_name',
            [req.session.userId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Unable to load categories' });
    }
});

// ADD CATEGORY
app.post('/api/categories', auth, async (req, res) => {
    try {
        const { category_name, category_type } = req.body;

        if (!category_name || !['Income', 'Expense'].includes(category_type)) {
            return res.status(400).json({ message: 'Invalid category details' });
        }

        const [result] = await db.execute(
            'INSERT INTO categories (user_id, category_name, category_type) VALUES (?, ?, ?)',
            [req.session.userId, category_name, category_type]
        );

        res.json({ message: 'Category added', category_id: result.insertId });
    } catch (err) {
        res.status(500).json({ message: 'Unable to add category' });
    }
});

// ADD TRANSACTION
app.post('/api/transactions', auth, async (req, res) => {
    try {
        const {
            category_id, amount, transaction_type,
            description, transaction_date
        } = req.body;

        if (!category_id || !amount || Number(amount) <= 0 ||
            !['Income', 'Expense'].includes(transaction_type) ||
            !transaction_date) {
            return res.status(400).json({ message: 'Please enter valid transaction details' });
        }

        const [category] = await db.execute(
            'SELECT category_id FROM categories WHERE category_id = ? AND user_id = ? AND category_type = ?',
            [category_id, req.session.userId, transaction_type]
        );

        if (category.length === 0) {
            return res.status(400).json({ message: 'Select a valid category' });
        }

        await db.execute(
            `INSERT INTO transactions
            (user_id, category_id, amount, transaction_type, description, transaction_date)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                req.session.userId, category_id, amount,
                transaction_type, description || '', transaction_date
            ]
        );

        res.json({ message: 'Transaction added successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Unable to add transaction' });
    }
});

// VIEW TRANSACTIONS
app.get('/api/transactions', auth, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT t.*, c.category_name
             FROM transactions t
             JOIN categories c ON t.category_id = c.category_id
             WHERE t.user_id = ?
             ORDER BY t.transaction_date DESC, t.transaction_id DESC`,
            [req.session.userId]
        );

        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: 'Unable to load transactions' });
    }
});

// UPDATE TRANSACTION
app.put('/api/transactions/:id', auth, async (req, res) => {
    try {
        const { category_id, amount, transaction_type,
                description, transaction_date } = req.body;

        const [category] = await db.execute(
            `SELECT category_id FROM categories
             WHERE category_id = ? AND user_id = ? AND category_type = ?`,
            [category_id, req.session.userId, transaction_type]
        );

        if (category.length === 0 || Number(amount) <= 0 ||
            !['Income', 'Expense'].includes(transaction_type)) {
            return res.status(400).json({ message: 'Invalid transaction details' });
        }

        const [result] = await db.execute(
            `UPDATE transactions
             SET category_id = ?, amount = ?, transaction_type = ?,
                 description = ?, transaction_date = ?
             WHERE transaction_id = ? AND user_id = ?`,
            [
                category_id, amount, transaction_type,
                description || '', transaction_date,
                req.params.id, req.session.userId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json({ message: 'Transaction updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Unable to update transaction' });
    }
});

// DELETE TRANSACTION
app.delete('/api/transactions/:id', auth, async (req, res) => {
    try {
        const [result] = await db.execute(
            'DELETE FROM transactions WHERE transaction_id = ? AND user_id = ?',
            [req.params.id, req.session.userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json({ message: 'Transaction deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Unable to delete transaction' });
    }
});

// DASHBOARD SUMMARY
app.get('/api/summary', auth, async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT
                COALESCE(SUM(CASE WHEN transaction_type = 'Income'
                THEN amount ELSE 0 END), 0) AS totalIncome,
                COALESCE(SUM(CASE WHEN transaction_type = 'Expense'
                THEN amount ELSE 0 END), 0) AS totalExpenses
             FROM transactions WHERE user_id = ?`,
            [req.session.userId]
        );

        const income = Number(rows[0].totalIncome);
        const expenses = Number(rows[0].totalExpenses);

        res.json({
            totalIncome: income,
            totalExpenses: expenses,
            balance: income - expenses
        });
    } catch (err) {
        res.status(500).json({ message: 'Unable to load summary' });
    }
});

// SET MONTHLY BUDGET
app.post('/api/budget', auth, async (req, res) => {
    try {
        const { monthly_limit, budget_month, budget_year } = req.body;

        if (Number(monthly_limit) <= 0 ||
            Number(budget_month) < 1 || Number(budget_month) > 12 ||
            !Number.isInteger(Number(budget_year))) {
            return res.status(400).json({ message: 'Enter valid budget details' });
        }

        await db.execute(
            `INSERT INTO budgets (user_id, monthly_limit, budget_month, budget_year)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)`,
            [req.session.userId, monthly_limit, budget_month, budget_year]
        );

        res.json({ message: 'Monthly budget saved successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Unable to save budget' });
    }
});

// MONTHLY REPORT
app.get('/api/report', auth, async (req, res) => {
    try {
        const month = Number(req.query.month) || new Date().getMonth() + 1;
        const year = Number(req.query.year) || new Date().getFullYear();

        const [rows] = await db.execute(
            `SELECT c.category_name,
                    t.transaction_type,
                    SUM(t.amount) AS total
             FROM transactions t
             JOIN categories c ON t.category_id = c.category_id
             WHERE t.user_id = ?
             AND MONTH(t.transaction_date) = ?
             AND YEAR(t.transaction_date) = ?
             GROUP BY c.category_name, t.transaction_type
             ORDER BY total DESC`,
            [req.session.userId, month, year]
        );

        const [budget] = await db.execute(
            `SELECT monthly_limit FROM budgets
             WHERE user_id = ? AND budget_month = ? AND budget_year = ?`,
            [req.session.userId, month, year]
        );

        res.json({
            transactions: rows,
            monthlyBudget: budget.length ? Number(budget[0].monthly_limit) : 0
        });
    } catch (err) {
        res.status(500).json({ message: 'Unable to generate report' });
    }
});

// START SERVER
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await db.query('SELECT 1');
        console.log('MySQL Database Connected Successfully!');

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('Database connection failed:', err.message);
    }
}

startServer();
