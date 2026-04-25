const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET_KEY = 'sarain-secret-2024';

// MongoDB Connection
const MONGO_URI = 'mongodb+srv://surenmagar468_db_user:suren1o1@cluster0.mg45c6v.mongodb.net/?appName=Cluster0';
const client = new MongoClient(MONGO_URI, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let db;
async function connectDB() {
    try {
        await client.connect();
        db = client.db('sarain');
        console.log('MongoDB connected!');
        
        // Setup default categories
        const catCount = await db.collection('categories').countDocuments();
        if (catCount === 0) {
            await db.collection('categories').insertMany([
                { name: 'Men', subcategories: 'Hoodies,T-Shirts,Jeans,Jackets,Shirts' },
                { name: 'Women', subcategories: 'Sarees,Korean Dresses,Tops,Kurtis,Skirts' },
                { name: 'Kids', subcategories: 'T-Shirts,Shorts,Dresses,Hoodies' }
            ]);
        }
    } catch (e) { console.error('MongoDB error:', e); }
}
connectDB();

const uploadDir = '/tmp/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({ destination: uploadDir, filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname) });
const upload = multer({ storage });

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(uploadDir));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/admin', (req, res) => res.redirect('/'));
app.get('/sarain-backend', (req, res) => res.sendFile(path.join(__dirname, 'views', 'admin.html')));
app.get('/men', (req, res) => res.sendFile(path.join(__dirname, 'views', 'category.html')));
app.get('/women', (req, res) => res.sendFile(path.join(__dirname, 'views', 'category.html')));
app.get('/kids', (req, res) => res.sendFile(path.join(__dirname, 'views', 'category.html')));
app.get('/product/:id', (req, res) => res.sendFile(path.join(__dirname, 'views', 'product.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'views', 'checkout.html')));

app.post('/api/register', async (req, res) => {
    const { username, password, security_question, security_answer } = req.body;
    if (!username || !password) return res.json({ success: false, message: 'Fill all fields' });
    const existing = await db.collection('users').findOne({ username });
    if (existing) return res.json({ success: false, message: 'Username taken' });
    await db.collection('users').insertOne({
        username, password: bcrypt.hashSync(password, 10),
        security_question: security_question || '', 
        security_answer: security_answer ? bcrypt.hashSync(security_answer.toLowerCase().trim(), 10) : '',
        is_admin: 0, created_at: new Date()
    });
    res.json({ success: true, message: 'Account created!' });
});

app.post('/api/login', async (req, res) => {
    const user = await db.collection('users').findOne({ username: req.body.username });
    if (!user || !bcrypt.compareSync(req.body.password, user.password)) return res.json({ success: false, message: 'Invalid credentials' });
    res.json({ success: true, token: jwt.sign({ id: user._id, username: user.username, is_admin: user.is_admin }, SECRET_KEY), user: { id: user._id, username: user.username, is_admin: user.is_admin } });
});

app.post('/api/forgot-password', async (req, res) => {
    const user = await db.collection('users').findOne({ username: req.body.username });
    if (!user) return res.json({ success: false, message: 'Not found' });
    res.json({ success: true, userId: user._id, question: user.security_question || 'No question' });
});

app.post('/api/reset-password', async (req, res) => {
    const user = await db.collection('users').findOne({ _id: new ObjectId(req.body.userId) });
    if (!user || !bcrypt.compareSync(req.body.answer.toLowerCase().trim(), user.security_answer)) return res.json({ success: false, message: 'Wrong answer' });
    await db.collection('users').updateOne({ _id: new ObjectId(req.body.userId) }, { $set: { password: bcrypt.hashSync(req.body.newPassword, 10) } });
    res.json({ success: true, message: 'Password updated!' });
});

app.get('/api/categories', async (req, res) => res.json(await db.collection('categories').find().toArray()));

app.get('/api/products', async (req, res) => {
    let filter = {};
    const { category, subcategory, search } = req.query;
    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (search) filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
    ];
    res.json(await db.collection('products').find(filter).toArray());
});

app.get('/api/products/:id', async (req, res) => {
    const p = await db.collection('products').findOne({ _id: new ObjectId(req.params.id) });
    res.json(p || {});
});

app.get('/api/search-history', async (req, res) => res.json((await db.collection('search_history').find().sort({ _id: -1 }).limit(10).toArray()).reverse()));
app.post('/api/search-history', async (req, res) => { 
    if(req.body.term) await db.collection('search_history').insertOne({ term: req.body.term, searched_at: new Date() }); 
    res.json({ success: true }); 
});

app.post('/api/admin/products', upload.array('images', 5), async (req, res) => {
    const { name, description, price, sale_price, category, subcategory, stock, sizes } = req.body;
    const images = req.files ? req.files.map(f => '/uploads/' + f.filename).join(',') : '';
    await db.collection('products').insertOne({ 
        name, description, price: parseFloat(price), sale_price: sale_price ? parseFloat(sale_price) : null, 
        category, subcategory: subcategory || '', images, stock: parseInt(stock) || 10, 
        sizes: sizes || 'S,M,L,XL', created_at: new Date() 
    });
    res.json({ success: true });
});

app.delete('/api/admin/products/:id', async (req, res) => { 
    await db.collection('products').deleteOne({ _id: new ObjectId(req.params.id) }); 
    res.json({ success: true }); 
});

app.get('/api/admin/users', async (req, res) => {
    const users = await db.collection('users').find({}, { projection: { username: 1, security_question: 1, created_at: 1 } }).toArray();
    res.json(users);
});

app.delete('/api/admin/users/:id', async (req, res) => { 
    await db.collection('users').deleteOne({ _id: new ObjectId(req.params.id) }); 
    res.json({ success: true, message: 'Deleted!' }); 
});

app.get('/api/admin/orders', async (req, res) => res.json(await db.collection('orders').find().toArray()));

app.post('/api/orders', async (req, res) => {
    const { items, total, name, phone, address } = req.body;
    const result = await db.collection('orders').insertOne({ user_id: 0, total, name, phone, address, status: 'pending', created_at: new Date() });
    for (const i of items) {
        await db.collection('order_items').insertOne({ order_id: result.insertedId, product_id: i.id, product_name: i.name, quantity: i.quantity || 1, price: i.price, size: i.size || 'M' });
    }
    res.json({ success: true, orderId: result.insertedId });
});

app.listen(PORT, () => console.log(`SARAIN: PORT ${PORT}`));