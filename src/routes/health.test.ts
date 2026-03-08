import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import app from '../index';

describe('Health Check Endpoints', () => {
  beforeEach(() => {
    // Clear cache and circuit breaker state
    // Note: In a real implementation, we'd need to expose these for testing
    // For now, we'll test the endpoints as black boxes
  });

  describe('GET /health', () => {
    it('should return 200 with health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        environment: expect.any(String)
      });
    });
  });

  describe('GET /ready', () => {
    it('should return 200 when Ollama is ready', async () => {
      // Mock successful Ollama response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      const response = await request(app)
        .get('/ready')
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.checks.ollama.status).toBe('ok');
    });

    it('should return 503 when Ollama is not ready', async () => {
      // Mock failed Ollama response
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500
      });

      const response = await request(app)
        .get('/ready')
        .expect(503);

      expect(response.body.status).toBe('not ready');
      expect(response.body.checks.ollama.status).toBe('failed');
    });

    it('should timeout after 5 seconds', async () => {
      // Mock timeout
      global.fetch = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 6000))
      );

      const response = await request(app)
        .get('/ready')
        .expect(503);

      expect(response.body.error).toBe('Health check service error');
    });
  });

  describe('GET /live', () => {
    it('should return 200 with liveness status', async () => {
      const response = await request(app)
        .get('/live')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'alive',
        timestamp: expect.any(String),
        pid: expect.any(Number),
        uptime: expect.any(Number)
      });
    });
  });

  describe('GET /metrics', () => {
    it('should return 200 with system metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toMatchObject({
        timestamp: expect.any(String),
        memory: expect.any(Object),
        cpu: expect.any(Object),
        uptime: expect.any(Number),
        environment: expect.any(String)
      });
    });
  });

  describe('OPTIONS requests', () => {
    it('should handle OPTIONS for /health', async () => {
      const response = await request(app)
        .options('/health')
        .expect(200);
    });

    it('should handle OPTIONS for /ready', async () => {
      const response = await request(app)
        .options('/ready')
        .expect(200);
    });

    it('should handle OPTIONS for /live', async () => {
      const response = await request(app)
        .options('/live')
        .expect(200);
    });

    it('should handle OPTIONS for /metrics', async () => {
      const response = await request(app)
        .options('/metrics')
        .expect(200);
    });
  });
});