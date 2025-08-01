import express from 'express';
import { serveFile, fetchAndLogGreeks } from '../controllers/main.controller.js';

const router = express.Router();

// Route to serve a simple frontend (optional)
router.get('/', serveFile('index.html'));

// Route to trigger the data fetching process
router.get('/fetch', fetchAndLogGreeks);

export default router;
