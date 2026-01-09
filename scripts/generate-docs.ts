/**
 * Script de generacion de documentacion tecnica con Compodoc.
 * Ejecuta el binario local para mantener la version del proyecto.
 */
import { execSync } from 'node:child_process';

const command = 'npx compodoc --config compodoc.json';
execSync(command, { stdio: 'inherit' });
