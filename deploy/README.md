# Health Check Enhancement Deployment Guide

This guide covers the deployment of the enhanced health check system for the Ollama Chat application.

## Overview

The enhanced health check system provides:
- Direct backend health checks (bypassing frontend proxy)
- Timeout protection for Ollama readiness checks
- Circuit breaker pattern for service protection
- Health check caching to reduce load
- Enhanced CORS configuration for load balancers
- Comprehensive monitoring and metrics

## Environment Configuration

### Required Environment Variables

Add these environment variables to your deployment configuration:

```bash
# Health Check Configuration
HEALTH_CHECK_TIMEOUT=5000                    # Timeout for Ollama readiness checks (ms)
HEALTH_CHECK_CACHE_DURATION=30000            # Cache duration for readiness checks (ms)
CIRCUIT_BREAKER_THRESHOLD=5                  # Number of failures before opening circuit
CIRCUIT_BREAKER_RESET_TIMEOUT=60000          # Time before circuit breaker resets (ms)

# Load Balancer Configuration
LOAD_BALANCER_ORIGINS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16  # Comma-separated list of load balancer IP ranges
```

### Example .env file

```bash
# Server Configuration
HTTP_LOCAL_PORT=5000
NODE_ENV=production

# Ollama Configuration
OLLAMA_API_URL=http://localhost:11434

# Frontend Configuration
FRONTEND_PORT=3000
FRONTEND_HOST=localhost

# Security Configuration
CORS_ORIGIN=https://your-domain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Health Check Configuration
HEALTH_CHECK_TIMEOUT=5000
HEALTH_CHECK_CACHE_DURATION=30000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT=60000

# Load Balancer Configuration
LOAD_BALANCER_ORIGINS=10.0.0.0/8,172.16.0.0/12

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log

# API Keys (optional)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

## Load Balancer Configuration

### AWS Application Load Balancer

Create a target group health check configuration:

```yaml
HealthCheckConfig:
  Protocol: HTTP
  Port: '5000'
  Path: /health
  IntervalSeconds: 30
  TimeoutSeconds: 5
  HealthyThresholdCount: 2
  UnhealthyThresholdCount: 2
  Matcher:
    HttpCode: '200'

TargetGroupConfig:
  Protocol: HTTP
  Port: 5000
  VpcId: ${VPC_ID}
  HealthCheckProtocol: HTTP
  HealthCheckPort: 5000
  HealthCheckPath: /health
  HealthCheckIntervalSeconds: 30
  HealthCheckTimeoutSeconds: 5
  HealthyThresholdCount: 2
  UnhealthyThresholdCount: 2
  Matcher:
    HttpCode: '200'
```

### Google Cloud Load Balancer

Create a health check configuration:

```yaml
apiVersion: compute/v1
kind: HealthCheck
metadata:
  name: ollama-chat-health-check
spec:
  type: HTTP
  httpHealthCheck:
    port: 5000
    requestPath: /health
    host: localhost
    proxyHeader: NONE
  checkIntervalSec: 30
  timeoutSec: 5
  healthyThreshold: 2
  unhealthyThreshold: 2
```

### Azure Load Balancer

Create a health probe configuration:

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "resources": [
    {
      "type": "Microsoft.Network/loadBalancers",
      "apiVersion": "2020-05-01",
      "name": "ollama-chat-lb",
      "properties": {
        "frontendIPConfigurations": [
          {
            "name": "LoadBalancerFrontEnd",
            "properties": {
              "privateIPAllocationMethod": "Dynamic"
            }
          }
        ],
        "backendAddressPools": [
          {
            "name": "BackendPool"
          }
        ],
        "loadBalancingRules": [
          {
            "name": "LBRule",
            "properties": {
              "frontendIPConfiguration": {
                "id": "[variables('lbID')]/frontendIPConfigurations/LoadBalancerFrontEnd"
              },
              "backendAddressPool": {
                "id": "[variables('lbID')]/backendAddressPools/BackendPool"
              },
              "protocol": "Tcp",
              "frontendPort": 5000,
              "backendPort": 5000,
              "enableFloatingIP": true
            }
          }
        ],
        "probes": [
          {
            "name": "HealthProbe",
            "properties": {
              "protocol": "Http",
              "port": 5000,
              "requestPath": "/health",
              "intervalInSeconds": 30,
              "numberOfProbes": 2
            }
          }
        ]
      }
    }
  ]
}
```

## Deployment Steps

### 1. Update Backend Configuration

1. Update your backend environment variables with the new health check settings
2. Deploy the enhanced backend with the new health check endpoints
3. Verify the backend health check endpoints are working:
   ```bash
   curl http://your-backend:5000/health
   curl http://your-backend:5000/ready
   curl http://your-backend:5000/live
   curl http://your-backend:5000/metrics
   ```

### 2. Update Frontend Configuration

1. Deploy the updated frontend server without health check proxying
2. Verify the frontend health endpoint is working:
   ```bash
   curl http://your-frontend:3000/health
   ```

### 3. Update Load Balancer Configuration

1. Update your load balancer to point health checks to the backend server (port 5000)
2. Configure health check path to `/health`
3. Set appropriate timeout and interval values

### 4. Update Monitoring

1. Configure Prometheus to scrape metrics from `/metrics` endpoint
2. Set up alerting rules for health check failures
3. Create dashboards for health check monitoring

## Monitoring and Alerting

### Prometheus Alerting Rules

Create alerting rules for health check monitoring:

```yaml
groups:
  - name: health-check-alerts
    rules:
      - alert: HealthCheckFailure
        expr: health_check_success_rate < 0.95
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Health check failure rate too high"
          description: "Health check success rate is {{ $value }}% for {{ $labels.path }}"
      
      - alert: HealthCheckResponseTime
        expr: health_check_response_time_avg > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Health check response time too high"
          description: "Health check response time is {{ $value }}ms for {{ $labels.path }}"
      
      - alert: OllamaServiceDown
        expr: ollama_readiness_status == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Ollama service is down"
          description: "Ollama service is not responding to readiness checks"
      
      - alert: CircuitBreakerOpen
        expr: circuit_breaker_open == 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Circuit breaker is open"
          description: "Circuit breaker has been open for {{ $value }} minutes"
```

### Grafana Dashboard

Create a dashboard with panels for:
- Health check success rates
- Response time percentiles
- Circuit breaker status
- Cache hit rates
- Ollama service availability

## Testing

### Manual Testing

1. **Backend Health Checks**:
   ```bash
   # Test all health check endpoints
   curl -v http://localhost:5000/health
   curl -v http://localhost:5000/ready
   curl -v http://localhost:5000/live
   curl -v http://localhost:5000/metrics
   ```

2. **Frontend Health Check**:
   ```bash
   curl -v http://localhost:3000/health
   ```

3. **CORS Testing**:
   ```bash
   # Test with load balancer origin
   curl -H "Origin: http://10.0.0.1" http://localhost:5000/health
   ```

4. **Circuit Breaker Testing**:
   - Stop Ollama service
   - Make 5+ readiness checks to trigger circuit breaker
   - Verify circuit breaker opens
   - Restart Ollama service
   - Wait for circuit breaker to reset

### Load Testing

Use tools like `hey` or `wrk` to test health check performance:

```bash
# Test health check performance
hey -n 1000 -c 100 http://localhost:5000/health

# Test readiness check with caching
hey -n 1000 -c 50 http://localhost:5000/ready
```

## Troubleshooting

### Common Issues

1. **CORS Errors**:
   - Verify `LOAD_BALANCER_ORIGINS` is set correctly
   - Check that load balancer IP ranges match your cloud provider
   - Ensure frontend and backend CORS configurations are compatible

2. **Circuit Breaker Stays Open**:
   - Verify Ollama service is running and accessible
   - Check circuit breaker reset timeout configuration
   - Monitor logs for circuit breaker state changes

3. **High Response Times**:
   - Check Ollama service performance
   - Verify network connectivity between backend and Ollama
   - Review cache hit rates

4. **Load Balancer Health Check Failures**:
   - Verify load balancer is pointing to backend (port 5000)
   - Check that health check path is `/health`
   - Ensure load balancer IP ranges are in `LOAD_BALANCER_ORIGINS`

### Log Analysis

Monitor logs for:
- Health check request/response patterns
- Circuit breaker state changes
- Cache hit/miss ratios
- CORS violations
- Performance metrics

## Rollback Plan

If issues occur after deployment:

1. **Quick Rollback**:
   - Revert frontend server to previous version
   - Update load balancer to point health checks back to frontend
   - Monitor for stability

2. **Configuration Rollback**:
   - Remove new environment variables
   - Revert CORS configuration
   - Restore previous health check settings

3. **Full Rollback**:
   - Deploy previous backend version
   - Deploy previous frontend version
   - Restore previous load balancer configuration

## Success Criteria

Deployment is successful when:
- [ ] All health check endpoints respond within 100ms
- [ ] Load balancer health checks succeed 99.9% of the time
- [ ] No CORS errors on health check requests
- [ ] Circuit breaker protects Ollama service during outages
- [ ] Health check caching reduces Ollama load by 90%
- [ ] Monitoring and alerting are functional
- [ ] Documentation is complete and accurate

## Support

For issues or questions:
1. Check the application logs
2. Review monitoring dashboards
3. Verify configuration settings
4. Test individual components
5. Consult the troubleshooting section above