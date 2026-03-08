# OpenSpec Proposal: Direct Backend Health Checks

**Change Name**: `fix-health-check-endpoints`  
**Created**: 2026-03-08  
**Status**: Draft  
**Type**: Infrastructure/Reliability  
**Priority**: High  
**Estimated Effort**: 2-3 days

## Problem Statement

Health checks are failing in production due to CORS configuration conflicts and proxy chain bottlenecks. The current architecture routes all health checks through the frontend proxy server, causing:

1. **CORS Conflicts**: Duplicate CORS middleware between frontend and backend servers
2. **Single Point of Failure**: Health checks fail if frontend server is down, even when backend is healthy
3. **Load Balancer Issues**: Health checks from load balancers blocked by CORS restrictions
4. **Performance Degradation**: Unnecessary proxy overhead for health check requests
5. **Monitoring Confusion**: Cannot distinguish between frontend and backend health issues

## Current Architecture Issues

```
Load Balancer → Frontend Server (3000) → Backend Server (5000) → Ollama
     ↓              ↓                    ↓
  Health Check → CORS Middleware → CORS Middleware → Ollama Check
```

**Problems Identified:**
- Double CORS processing causes conflicts
- Frontend server acts as unnecessary bottleneck
- Load balancer health checks blocked by frontend CORS restrictions
- No timeout protection for Ollama readiness checks
- No circuit breaker pattern for Ollama service failures

## Proposed Solution

Implement **Direct Backend Health Checks** architecture where load balancers check the backend server directly, bypassing the frontend proxy for health check requests.

### New Architecture

```
Load Balancer → Backend Server (5000) → Ollama
     ↓              ↓                    ↓
  Health Check → Enhanced CORS → Timeout Protection → Ollama Check

Frontend Server (3000) → Backend Server (5000) → Ollama
     ↓                    ↓                    ↓
  Application Traffic → API Proxy → Backend Logic
```

## Key Benefits

1. **✅ Eliminates CORS Conflicts**: Single CORS configuration on backend
2. **✅ Reduces Single Points of Failure**: Backend health checks independent of frontend
3. **✅ Improves Performance**: Direct health check access, no proxy overhead
4. **✅ Better Monitoring**: Clear separation of frontend vs backend health
5. **✅ Production Ready**: Standard pattern used by major cloud providers
6. **✅ Load Balancer Compatible**: Works with AWS ALB, GCP LB, Azure LB

## Scope

### In Scope
- [ ] Remove health check proxying from frontend server
- [ ] Enhance backend health check endpoints with timeout protection
- [ ] Implement circuit breaker pattern for Ollama readiness checks
- [ ] Add health check caching to reduce Ollama load
- [ ] Update CORS configuration for production load balancers
- [ ] Create load balancer configuration templates
- [ ] Add comprehensive health check monitoring and alerting
- [ ] Update deployment documentation

### Out of Scope
- [ ] Frontend application logic changes (except CORS)
- [ ] Database schema modifications
- [ ] Authentication system changes
- [ ] Ollama server configuration
- [ ] Supabase configuration changes

## Success Criteria

### Functional Requirements
- [ ] Health checks respond in < 100ms (currently > 1s due to proxy)
- [ ] Load balancer health checks succeed 99.9% of the time
- [ ] No CORS errors on health check requests
- [ ] Ollama readiness checks have timeout protection (< 5s)
- [ ] Circuit breaker prevents Ollama overload during outages
- [ ] Health check caching reduces Ollama requests by 90%

### Non-Functional Requirements
- [ ] Zero downtime deployment
- [ ] Backward compatibility with existing monitoring
- [ ] Production-ready error handling and logging
- [ ] Comprehensive test coverage for health check endpoints
- [ ] Documentation for load balancer configuration

## Implementation Approach

### Phase 1: Backend Health Check Enhancement (Day 1)
1. **Enhance Health Check Endpoints**
   - Add timeout protection for Ollama readiness checks
   - Implement circuit breaker pattern
   - Add health check caching (30-second cache)
   - Improve error handling and logging

2. **Update CORS Configuration**
   - Configure production-appropriate CORS for load balancers
   - Add load balancer IP ranges to allowed origins
   - Create environment-specific CORS settings

### Phase 2: Frontend Server Changes (Day 1-2)
1. **Remove Health Check Proxying**
   - Remove `/health` from proxy prefixes
   - Add direct frontend health endpoint
   - Update CORS configuration

2. **Update Application Logic**
   - Ensure frontend health endpoint provides basic health status
   - Maintain existing application proxy functionality

### Phase 3: Load Balancer Configuration (Day 2)
1. **Create Configuration Templates**
   - AWS ALB health check configuration
   - GCP Load Balancer health check configuration
   - Azure Load Balancer health check configuration

2. **Update Deployment Scripts**
   - Add health check configuration to deployment process
   - Update environment-specific configurations

### Phase 4: Monitoring and Alerting (Day 3)
1. **Implement Monitoring**
   - Add health check metrics collection
   - Create health check dashboards
   - Set up alerting for health check failures

2. **Testing and Validation**
   - Load test health check endpoints
   - Validate load balancer configuration
   - Test failover scenarios

## Risk Assessment

### High Risk
- **Load Balancer Downtime**: Incorrect configuration could cause service outage
  - **Mitigation**: Blue-green deployment with rollback plan
  - **Mitigation**: Test configuration in staging environment first

### Medium Risk
- **Health Check Performance**: Poorly implemented caching could cause issues
  - **Mitigation**: Implement proper cache invalidation
  - **Mitigation**: Monitor cache hit rates and performance

### Low Risk
- **Monitoring Gaps**: Missing alerts for new health check patterns
  - **Mitigation**: Comprehensive monitoring setup
  - **Mitigation**: Alert validation and testing

## Dependencies

### External Dependencies
- Load balancer access and configuration permissions
- Ollama server availability for testing
- Monitoring system access (Prometheus, Grafana, etc.)

### Internal Dependencies
- Existing deployment pipeline
- Environment configuration management
- Team coordination for deployment timing

## Rollback Plan

1. **Immediate Rollback**: Revert frontend server changes to restore health check proxying
2. **Load Balancer Rollback**: Update health check configuration to point back to frontend
3. **Monitoring Rollback**: Restore previous monitoring and alerting configuration
4. **Communication**: Notify team of rollback and investigate issues

## Next Steps

1. **Create detailed design document** with technical specifications
2. **Set up staging environment** for testing changes
3. **Create implementation tasks** in task management system
4. **Schedule deployment window** with team coordination
5. **Prepare monitoring and alerting** for new health check patterns

## Approval

**Proposed by**: AI Assistant  
**Date**: 2026-03-08  
**Review required by**: Development Team Lead  
**Implementation start**: After approval and staging validation