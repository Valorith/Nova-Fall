import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config/index.js';

async function corsPlugin(fastify: FastifyInstance) {
  await fastify.register(cors, {
    origin: config.server.isDev
      ? true
      : [config.urls.frontend],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}

export default fp(corsPlugin, {
  name: 'cors',
});
