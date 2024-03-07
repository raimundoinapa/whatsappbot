//npm init -y
//npm i express express-session express-validator express-sse ejs dotenv ldapjs ldap-client xlsx whatsapp-web.js qrcode-terminal

const generateID = (len = 12) => {
    let id = '';
    let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

    for (i = 0; i < len; i++) { id += chars.charAt(Math.floor(Math.random() * chars.length)); }

    return id;
}

const getTimestamp = (date = false) => {
    const d = ! date ? new Date() : new Date(date);
    
    return new Date(d - d.getTimezoneOffset() * 60 * 1000).toJSON().replace('T', ' ').split('.')[0];
}

const path = require('path');

const express = require('express');
const session = require('express-session');
const { body, validationResult } = require('express-validator');
const SSE = require('express-sse');
//const { Client } = require('whatsapp-web.js');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const port = 3001;
const app = express();
const publicFolder = path.join(__dirname, 'public');
const sseObject = {};

app.use(session({
    secret: getTimestamp(),
    resave: false,
    saveUninitialized: true,
}));
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(express.static(publicFolder));

app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);
app.set('views', publicFolder);

const isNumber = n => 'number' == typeof n && ! isNaN(n)

const isAuthenticated = (req, res, next) => {    
    const { clientToken } = req.body;
    const resonse = {status: 'error', message: 'Su token es inválido o ha vencido.', redirect: '/'};

    if (! req?.session || ! req?.session?.user || ! req?.session?.user?.token) {
        if (clientToken) { return res.status(401).json(resonse); }//Si no esta logueado, pero envía un token

        return res.redirect('/');
    }

    //Si esta logueado, pero el token no existe o es diferente al de la sessión
    if (! clientToken || (clientToken && clientToken != req?.session?.user?.token)) { return res.status(401).json(resonse); }

    return next();
};

app.get('/', (req, res) => {
    res.render('home.html', {});
});

app.get('/events', (req, res) => {
    sseObject.sse = new SSE({time: getTimestamp()});

    //Este método era nativo de express, pero ha quedado obsoleto, sin embargo express-sse trata de usarlo, así que lo creamos vacío
    //Por otro lado pudieramos usar const compression = require('compression'); app.use(compression()); ya este middleware agrega el método flush
    res.flush = () => {};
    
    sseObject.sse.init(req, res);    

    /* setInterval(() => {
        sseObject.sse.send({time: getTimestamp()});
    }, 2000); */
});

const startEventsEmitter = (req, res) => {}

app.post('/getinstance', async (req, res) => {
    if (! Object.keys(sseObject).length) {
        return res.status(422).json({message: 'No se ha iniciado el escuchador de eventos'});
    }

    /* if (! req?.params?.user || ! req.params.user.test(/^[0-9]{10,}$/)) {
        return res.status(422).json({message: 'No se encuentra el UA inválido'});
    } */

    //const client = new Client({authStrategy: new LocalAuth()});
    const client = new Client({qrMaxRetries: 3});

    let clientQr = '';

    client.on('qr', (qr) => {
        //console.log('Qr received', qr, sseObject);

        //qrcode.generate(qr, { small: true });
        
        clientQr = qr;

        sseObject.sse.send({event: 'qr', qr: qr});
    });

    client.on('ready', (r) => {
        console.log('Client is ready!', r, client);

        /* info: {
            pushname: "'Raimundo Araujo",
            wid: {
                server: 'c.us',
                user: '18097037587',
                _serialized: '18097037587@c.us'
            },
            me: {
                server: 'c.us',
                user: '18097037587',
                _serialized: '18097037587@c.us'
            },
            phone: undefined,
            platform: 'android'
        } */

        if (! req.session?.clients || ! Object.keys(req.session.clients).length) { req.session.clients = {}; }

        req.session.clients[req.params.user] = client;

        sseObject.sse.send({event: 'ready', r: r, clientInfo: client.info});
    });

    client.on('message', async (msg) => {
        console.log({message: msg});

        if (msg.body == 'klk') {
            await msg.reply('manso');
        }

        if (msg.body === 'ok') {
            console.log(msg.from);

            await client.sendMessage(msg.from, 'cool');
        }
        
        sseObject.sse.send({event: 'message', msg: msg, clientInfo: client.info});
    });

    client.on('change_state', state => {
        console.log('CHANGE STATE', state);

        sseObject.sse.send({event: 'change_state', state: state});
    });

    client.on('disconnected', (reason) => {
        console.log('Client was logged out', reason);

        //Posiblemente, se agotó el qrMaxRetries 
        if (! client?.info) {
            console.log('Número máximo de intentos de generación de qr agotados');

            client.destroy();

            sseObject.sse.send({event: 'disconnected', reason: reason});

            return false;
        }

        sseObject.sse.send({event: 'disconnected', reason: reason});
    });

    client.initialize();

    //req.session.user = {token: generateID(), id: username.toLowerCase()};

    return res.status(200).json({message: 'Instancia de Whatsapp iniciada'});
});

app.get(
    '/client/:user',
    [
        body('text').trim().notEmpty()
    ],
    (req, res) => {
        if (! req.session?.clients || req.params?.user || ! req.session.clients[req.params.user]) {
            return res.status(422).json({message: 'No se encuentra el UA inválido'});
        }

        //await client.sendMessage(chatId, 'Message Text')

        //client.sendMessage(number, (text+" "+number));
    }
);

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});