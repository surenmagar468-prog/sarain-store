const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET_KEY = 'sarain-secret-2024';

// Simple JSON database
const DB_PATH = '/tmp/sarain-data.json';
let db = { users: [], products: [], orders: [], order_items: [], search_history: [], categories: [
    { id: 1, name: 'Men', subcategories: 'Hoodies,T-Shirts,Jeans,Jackets,Shirts' },
    { id: 2, name: 'Women', subcategories: 'Sarees,Korean Dresses,Tops,Kurtis,Skirts' },
    { id: 3, name: 'Kids', subcategories: 'T-Shirts,Shorts,Dresses,Hoodies' }
]};

function loadDB() {
    try { if (fs.existsSync(DB_PATH)) db = JSON.parse(fs.readFileSync(DB_PATH)); }
    catch(e) { console.log('New database created'); }
}
function saveDB() { fs.writeFileSync(DB_PATH, JSON.stringify(db)); }
loadDB();

const storage = multer.diskStorage({ destination: '/tmp/uploads/', filename: (req, file, cb) => { if(!fs.existsSync('/tmp/uploads/')) fs.mkdirSync('/tmp/uploads/'); cb(null, Date.now() + '-' + file.originalname); } });
const upload = multer({ storage });

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('/tmp/uploads'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/men', (req, res) => res.sendFile(path.join(__dirname, 'views', 'category.html')));
app.get('/women', (req, res) => res.sendFile(path.join(__dirname, 'views', 'category.html')));
app.get('/kids', (req, res) => res.sendFile(path.join(__dirname, 'views', 'category.html')));
app.get('/product/:id', (req, res) => res.sendFile(path.join(__dirname, 'views', 'product.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'views', 'checkout.html')));

app.post('/api/register', (req, res) => {
    const { username, password, security_question, security_answer } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Please fill all fields' });
    if (db.users.find(u => u.username === username)) return res.json({ success: false, message: 'Username already taken' });
    db.users.push({
        id: Date.now(), username, password: bcrypt.hashSync(password, 10),
        security_question: security_question || '', security_answer: security_answer ? bcrypt.hashSync(security_answer.toLowerCase().trim(), 10) : '',
        is_admin: 0, created_at: new Date().toISOString()
    });
    saveDB();
    res.json({ success: true, message: 'Account created!' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.json({ success: false, message: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, SECRET_KEY);
    res.json({ success: true, token, user: { id: user.id, username: user.username, is_admin: user.is_admin } });
});

app.post('/api/forgot-password', (req, res) => {
    const user = db.users.find(u => u.username === req.body.username);
    if (!user) return res.json({ success: false, message: 'Username not found' });
    res.json({ success: true, userId: user.id, question: user.security_question || 'No question set' });
});

app.post('/api/reset-password', (req, res) => {
    const user = db.users.find(u => u.id == req.body.userId);
    if (!user || !bcrypt.compareSync(req.body.answer.toLowerCase().trim(), user.security_answer)) return res.json({ success: false, message: 'Wrong answer' });
    user.password = bcrypt.hashSync(req.body.newPassword, 10);
    saveDB();
    res.json({ success: true, message: 'Password updated!' });
});

app.get('/api/categories', (req, res) => res.json(db.categories));

app.get('/api/products', (req, res) => {
    let products = db.products;
    const { category, subcategory, search } = req.query;
    if (category) products = products.filter(p => p.category === category);
    if (subcategory) products = products.filter(p => p.subcategory === subcategory);
    if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));
    res.json(products);
});

app.get('/api/products/:id', (req, res) => {
    const p = db.products.find(p => p.id == req.params.id);
    res.json(p || {});
});

app.get('/api/search-history', (req, res) => res.json(db.search_history.slice(-10).reverse()));
app.post('/api/search-history', (req, res) => { if(req.body.term) db.search_history.push({ term: req.body.term, searched_at: new Date().toISOString() }); saveDB(); res.json({ success: true }); });

app.post('/api/admin/products', upload.array('images', 5), (req, res) => {
    const { name, description, price, sale_price, category, subcategory, stock, sizes } = req.body;
    const images = req.files ? req.files.map(f => '/uploads/' + f.filename).join(',') : '';
    db.products.push({ id: Date.now(), name, description, price: parseFloat(price), sale_price: sale_price ? parseFloat(sale_price) : null, category, subcategory: subcategory || '', images, stock: parseInt(stock) || 10, sizes: sizes || 'S,M,L,XL', created_at: new Date().toISOString() });
    saveDB();
    res.json({ success: true });
});

app.delete('/api/admin/products/:id', (req, res) => { db.products = db.products.filter(p => p.id != req.params.id); saveDB(); res.json({ success: true }); });
app.get('/api/admin/users', (req, res) => res.json(db.users.map(u => ({ id: u.id, username: u.username, security_question: u.security_question, created_at: u.created_at }))));
app.delete('/api/admin/users/:id', (req, res) => { db.users = db.users.filter(u => u.id != req.params.id); saveDB(); res.json({ success: true, message: 'Deleted!' }); });
app.get('/api/admin/orders', (req, res) => res.json(db.orders));

app.post('/api/orders', (req, res) => {
    const { items, total, name, phone, address } = req.body;
    const oid = Date.now();
    db.orders.push({ id: oid, user_id: 0, total, name, phone, address, status: 'pending', created_at: new Date().toISOString() });
    items.forEach(i => db.order_items.push({ id: Date.now() + Math.random(), order_id: oid, product_id: i.id, product_name: i.name, quantity: i.quantity || 1, price: i.price, size: i.size || 'M' }));
    saveDB();
    res.json({ success: true, orderId: oid });
});

app.listen(PORT, () => console.log(`SARAIN: http://localhost:${PORT}`));