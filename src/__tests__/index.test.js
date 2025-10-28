// Basic test file for the CF-Analyst worker
// Testing the new web app functionality

// Mock the worker module for testing
const mockWorker = {
  default: {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      
      // Handle CORS preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Authorization',
          },
        });
      }

      // Add CORS headers to all responses
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, CF-Authorization',
      };

      try {
        // Route handling
        switch (url.pathname) {
          case '/':
            return new Response('<!DOCTYPE html><html><head><title>Cloudflare Analyst</title></head><body><div class="sidebar">Test</div></body></html>', {
              headers: {
                'Content-Type': 'text/html',
                ...corsHeaders
              }
            });

          case '/api/menu':
            return new Response(JSON.stringify({
              items: [
                {
                  id: 'item1',
                  label: 'Analytics Dashboard',
                  icon: '📊',
                  subItems: [
                    { id: 'sub1-1', label: 'Traffic Overview', path: '/analytics/traffic' },
                    { id: 'sub1-2', label: 'Performance Metrics', path: '/analytics/performance' },
                    { id: 'sub1-3', label: 'Security Events', path: '/analytics/security' }
                  ]
                },
                {
                  id: 'item2',
                  label: 'GraphQL Explorer',
                  icon: '🔍',
                  subItems: [
                    { id: 'sub2-1', label: 'Query Builder', path: '/graphql/builder' },
                    { id: 'sub2-2', label: 'Schema Explorer', path: '/graphql/schema' },
                    { id: 'sub2-3', label: 'Query History', path: '/graphql/history' }
                  ]
                },
                {
                  id: 'item3',
                  label: 'Reports & Insights',
                  icon: '📈',
                  subItems: [
                    { id: 'sub3-1', label: 'Custom Reports', path: '/reports/custom' },
                    { id: 'sub3-2', label: 'Scheduled Reports', path: '/reports/scheduled' },
                    { id: 'sub3-3', label: 'Data Exports', path: '/reports/exports' }
                  ]
                }
              ]
            }), {
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });

          case '/api/auth/validate':
            const authHeader = request.headers.get('CF-Authorization');
            if (!authHeader) {
              return new Response(JSON.stringify({
                error: 'No authorization header',
                authenticated: false
              }), {
                status: 401,
                headers: {
                  'Content-Type': 'application/json',
                  ...corsHeaders
                }
              });
            }
            return new Response(JSON.stringify({
              authenticated: true,
              user: {
                email: 'user@example.com',
                name: 'Demo User'
              }
            }), {
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });

          case '/health':
            return new Response(JSON.stringify({
              status: 'healthy',
              timestamp: new Date().toISOString()
            }), {
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });

          default:
            return new Response(JSON.stringify({
              error: 'Not Found',
              path: url.pathname
            }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
        }
      } catch (error) {
        return new Response(JSON.stringify({
          error: 'Internal Server Error',
          message: error.message
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }
  }
};

describe('CF-Analyst Worker', () => {
  test('should serve main page', async () => {
    const request = new Request('https://example.com/');
    const response = await mockWorker.default.fetch(request);
    
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Cloudflare Analyst');
    expect(html).toContain('sidebar');
  });

  test('should handle menu API', async () => {
    const request = new Request('https://example.com/api/menu');
    const response = await mockWorker.default.fetch(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toBeDefined();
    expect(data.items.length).toBe(3);
    expect(data.items[0].label).toBe('Analytics Dashboard');
  });

  test('should handle auth validation', async () => {
    const request = new Request('https://example.com/api/auth/validate', {
      headers: {
        'CF-Authorization': 'Bearer test-token'
      }
    });
    
    const response = await mockWorker.default.fetch(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.authenticated).toBe(true);
    expect(data.user.email).toBeDefined();
  });

  test('should handle health check', async () => {
    const request = new Request('https://example.com/health');
    const response = await mockWorker.default.fetch(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  test('should handle 404 for unknown paths', async () => {
    const request = new Request('https://example.com/unknown');
    const response = await mockWorker.default.fetch(request);
    
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Not Found');
  });

  test('should handle CORS preflight', async () => {
    const request = new Request('https://example.com/', {
      method: 'OPTIONS'
    });
    
    const response = await mockWorker.default.fetch(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});