import './styles.css';
import { mountApp } from './ui/app.js';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');

mountApp(root);
