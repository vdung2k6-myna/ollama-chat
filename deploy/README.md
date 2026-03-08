# Deployment Guide

This directory contains deployment configurations and scripts for the Ollama Chat application.

## Overview

The Ollama Chat application uses a dual-server architecture with:
- **Backend Server** (port 5000): API server with health checks
- **Frontend Server** (port 3000): Static file server and API proxy

## Health Check Configuration

### Load Balancer Setup

For production deployments, configure your load balancer to check the backend server directly:

1. **Target**: Backend server on port 5000
2. **Health Check Path**: `/health`
3. **Protocol**: HTTP
4. **Timeout**: 5-30 seconds
5. **Interval**: 30 seconds
6. **Healthy Threshold**: 2 consecutive successes
7. **Unhealthy Threshold**: 2 consecutive failures

### Cloud Provider Templates

Configuration templates are provided for major cloud providers:

- **AWS**: `aws/alb-health-check.yaml` - Application Load Balancer configuration
- **GCP**: `gcp/health-check.yaml` - HTTP(S) Load Balancer configuration  
- **Azure**: `azure/health-check.json` - Load Balancer and Application Gateway configuration

### Health Check Features

The enhanced health check system includes:

- **Timeout Protection**: 5-second timeout to prevent hanging
- **Circuit Breaker**: Opens after 5 consecutive failures, resets after 60 seconds
- **Caching**: Results cached for 30 seconds to reduce Ollama load
- **Detailed Metrics**: Prometheus-compatible metrics at `/metrics`

## Environment Configuration

### Required Environment Variables

```bash
# Backend Configuration
HTTP_LOCAL_PORT=5000
OLLAMA_API_URL=http://localhost:11434
NODE_ENV=production

# Frontend Configuration  
FRONTEND_PORT=3000
FRONTEND_HOST=localhost

# Security
CORS_ORIGIN=your-allowed-origins
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Health Check Configuration
HEALTH_CHECK_TIMEOUT=5000
HEALTH_CHECK_CACHE_DURATION=30000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT=60000

# Load Balancer Configuration
LOAD_BALANCER_ORIGINS=comma-separated-origins

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

### Production CORS Configuration

For production deployments, configure CORS origins:

```bash
# Example for AWS ALB
LOAD_BALANCER_ORIGINS=https://your-alb-dns.amazonaws.com,https://your-alb-internal.amazonaws.com

# Example for GCP
LOAD_BALANCER_ORIGINS=https://your-lb-region.gcp.com

# Example for Azure
LOAD_BALANCER_ORIGINS=https://your-lb.azure.com
```

## Monitoring and Alerting

### Prometheus Metrics

Health check metrics are available at `/metrics` endpoint:

- `health_check_requests_total` - Total health check requests
- `health_check_success_rate` - Success rate percentage
- `health_check_response_time_avg` - Average response time
- `circuit_breaker_open` - Circuit breaker status

### Grafana Dashboard

Import `monitoring/dashboards/health-checks.json` into Grafana to visualize health check metrics.

### Alerting Rules

Prometheus alerting rules are provided in `monitoring/alerts.yml`:

- Health check failure rate > 95%
- Response time > 100ms
- Circuit breaker open
- Ollama service unavailable

## Deployment Strategies

### Blue-Green Deployment

Use the provided deployment scripts for zero-downtime deployments:

1. Deploy to green environment
2. Run health checks
3. Switch traffic to green
4. Monitor and validate
5. Clean up blue environment

### Rolling Deployment

For containerized deployments:

1. Update container images
2. Deploy new version alongside old
3. Gradually shift traffic
4. Monitor health checks
5. Remove old version

## Troubleshooting

### Health Check Failures

1. **Check Ollama Service**:
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. **Verify Backend Server**:
   ```bash
   curl http://localhost:5000/health
   ```

3. **Check Circuit Breaker**:
   ```bash
   curl http://localhost:5000/ready
   ```

4. **Review Logs**:
   ```bash
   tail -f logs/app.log
   ```

### Common Issues

1. **CORS Errors**: Verify `LOAD_BALANCER_ORIGINS` configuration
2. **Timeout Issues**: Check Ollama service responsiveness
3. **Circuit Breaker Open**: Wait for reset timeout or restart service
4. **Load Balancer Health Checks**: Ensure proper port and path configuration

### Circuit Breaker Recovery

If circuit breaker is open:

1. Wait 60 seconds for automatic reset
2. Check Ollama service status
3. Review error logs for underlying issues
4. Consider adjusting thresholds in configuration

## Security Considerations

### Production Security

1. **Restrict CORS Origins**: Only allow trusted domains
2. **Enable HTTPS**: Use SSL/TLS for all communications
3. **Secure Headers**: Ensure security headers are enabled
4. **Rate Limiting**: Configure appropriate rate limits
5. **Environment Variables**: Store secrets securely

### OAuth Configuration

Ensure OAuth providers are properly configured:

- GitHub OAuth callback URLs
- Supabase authentication settings
- CORS origins for OAuth redirects

## Performance Optimization

### Health Check Optimization

1. **Caching**: Leverage 30-second cache for readiness checks
2. **Timeouts**: Use appropriate timeouts to prevent hanging
3. **Circuit Breaker**: Prevent Ollama overload during failures
4. **Monitoring**: Use metrics to identify performance issues

### Load Balancer Optimization

1. **Health Check Intervals**: Balance between responsiveness and load
2. **Timeout Configuration**: Match application response times
3. **Connection Pooling**: Configure appropriate connection limits
4. **SSL Termination**: Consider SSL offloading at load balancer

## Support

For deployment issues:

1. Check application logs
2. Verify health check endpoints
3. Review load balancer configuration
4. Monitor metrics and alerts
5. Consult cloud provider documentation

## Additional Resources

- [Ollama Documentation](https://ollama.ai)
- [Supabase Authentication](https://supabase.com/docs/guides/auth)
- [Prometheus Monitoring](https://prometheus.io/docs)
- [Grafana Dashboards](https://grafana.com/docs)