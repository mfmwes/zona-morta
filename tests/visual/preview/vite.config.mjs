import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({root:resolve(import.meta.dirname),publicDir:resolve(import.meta.dirname,'../../../public'),resolve:{alias:{'@':resolve(import.meta.dirname,'../../..')}},plugins:[react()],server:{host:'127.0.0.1',port:4173,strictPort:true}});
