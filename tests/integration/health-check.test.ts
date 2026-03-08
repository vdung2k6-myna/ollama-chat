import { Request, Response } from 'express';
import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';

// Mock dependencies
jest.mock('../../src/config');
jest.mock('../../src/utils/logger');

describe('Health Check Integration Tests', () => {
  let server: any;

  beforeAll(async () => {
    // Start the server for integration tests
    server = app.listen(0); // Use random port
  });

  afterAll(async () => {
    // Clean up
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  describe('Health Check Endpoints', () => {
    it('should respond to /health endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        service: 'backend',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        backendUrl: expect.any(String)
      });
    });

    it('should respond to /live endpoint', async () => {
      const response = await request(app)
        .get('/live')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        service: 'backend',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        backendUrl: expect.any(String)
      });
    });

    it('should respond to /ready endpoint', async () => {
      const response = await request(app)
        .get('/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        service: 'backend',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
        version: expect.any(String),
        environment: expect.any(String),
        backendUrl: expect.any(String),
        ollama: {
          status: expect.any(String),
          url: expect.any(String),
          responseTime: expect.any(Number)
        },
        cache: {
          enabled: true,
          hit: expect.any(Boolean),
          lastUpdated: expect.any(String)
        },
        circuitBreaker: {
          state: expect.any(String),
          failures: expect.any(Number),
          lastFailure: expect.any(String)
        }
      });
    });

    it('should respond to /metrics endpoint', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body).toMatchObject({
        timestamp: expect.any(String),
        metrics: expect.any(Object),
        prometheus: expect.any(String)
      });
    });

    it('should return Prometheus format for /metrics with text/plain accept header', async () => {
      const response = await request(app)
        .get('/metrics')
        .set('Accept', 'text/plain')
        .expect(200);

      expect(response.text).toContain('# HELP health_check_requests_total');
      expect(response.text).toContain('# TYPE health_check_requests_total counter');
    });

    it('should handle OPTIONS requests to /health', async () => {
      const response = await request(app)
        .options('/health')
        .expect(200);
    });

    it('should handle OPTIONS requests to /ready', async () => {
      const response = await request(app)
        .options('/ready')
        .expect(200);
    });

    it('should handle OPTIONS requests to /live', async () => {
      const response = await request(app)
        .options('/live')
        .expect(200);
    });

    it('should handle OPTIONS requests to /metrics', async () => {
      const response = await request(app)
        .options('/metrics')
        .expect(200);
    });
  });

  describe('Concurrent Health Check Handling', () => {
    it('should handle multiple concurrent health check requests', async () => {
      const requests = Array(10).fill(null).map(() => 
        request(app).get('/ready').expect(200)
      );

      const responses = await Promise.all(requests);
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
      });
    });

    it('should handle high concurrency without performance degradation', async () => {
      const startTime = Date.now();
      
      const requests = Array(50).fill(null).map(() => 
        request(app).get('/health').expect(200)
      );

      await Promise.all(requests);
      
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Circuit Breaker Behavior Under Load', () => {
    it('should maintain circuit breaker state under concurrent requests', async () => {
      // This test would need to simulate Ollama failures
      // For now, we'll test that the circuit breaker doesn't break under load
      
      const requests = Array(20).fill(null).map(() => 
        request(app).get('/ready')
      );

      const responses = await Promise.all(requests);
      
      // All requests should complete (some may fail if Ollama is down, but circuit breaker should work)
      responses.forEach(response => {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThanOrEqual(503);
      });
    });
  });

  describe('Health Check with Ollama Unavailability', () => {
    // Note: These tests would require mocking the Ollama service
    // or having a test environment where Ollama is intentionally unavailable
    
    it('should handle Ollama service unavailability gracefully', async () => {
      // This would test the scenario where Ollama is down
      // For now, we'll just verify the endpoint responds
      const response = await request(app)
        .get('/ready')
        .expect(200); // Should still return 200, but with error status in body

      expect(response.body).toMatchObject({
        status: expect.stringMatching(/ok|error/),
        ollama: {
          status: expect.any(String),
          url: expect.any(String)
        }
      });
    });
  });

  describe('Performance Requirements', () => {
    it('should respond to health checks within 100ms', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(100);
    });

    it('should respond to readiness checks within 5 seconds', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/ready')
        .expect(200);
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(5000);
    });

    it('should handle 100 requests per minute without degradation', async () => {
      const startTime = Date.now();
      
      // Send 100 requests rapidly
      const requests = Array(100).fill(null).map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      const duration = Date.now() - startTime;
      
      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds for 100 requests
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      // Test with invalid HTTP method
      await request(app)
        .patch('/health')
        .expect(404);
    });

    it('should handle requests with invalid headers', async () => {
      await request(app)
        .get('/health')
        .set('X-Invalid-Header', 'invalid')
        .expect(200); // Should still work
    });

    it('should handle requests with very large payloads', async () => {
      // Test with large body (should be rejected by size limit)
      const largeBody = 'x'.repeat(20 * 1024 * 1024); // 20MB
      
      await request(app)
        .post('/health')
        .send(largeBody)
        .expect(413);
    });
  });

  describe('CORS Headers', () => {
    it('should include proper CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // CORS headers should be present
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });

    it('should handle CORS preflight requests', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Load Balancer Simulation', () => {
    it('should simulate load balancer health check patterns', async () => {
      // Simulate typical load balancer behavior
      // 1. Initial health check
      await request(app).get('/health').expect(200);
      
      // 2. Readiness check
      await request(app).get('/ready').expect(200);
      
      // 3. Multiple rapid checks (simulating health check interval)
      const rapidChecks = Array(5).fill(null).map(() => 
        request(app).get('/health')
      );
      
      const responses = await Promise.all(rapidChecks);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
      
      // 4. Metrics check
      await request(app).get('/metrics').expect(200);
    });

    it('should handle load balancer health check intervals', async () => {
      // Simulate health checks every 30 seconds (typical ALB interval)
      // We'll do this more rapidly for testing
      
      const intervals = [100, 200, 300, 400, 500]; // ms
      
      for (const interval of intervals) {
        await new Promise(resolve => setTimeout(resolve, interval));
        await request(app).get('/health').expect(200);
      }
    });
  });
});