/**
 * CF-Analyst Worker
 * Main entry point for the Cloudflare Worker
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Add CORS headers to all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    try {
      // Route handling
      switch (url.pathname) {
        case '/':
          return new Response(JSON.stringify({
            message: 'CF-Analyst Worker is running',
            timestamp: new Date().toISOString(),
            environment: env.ENVIRONMENT || 'development'
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

        case '/api/analytics':
          if (request.method === 'POST') {
            const data = await request.json();
            // Process analytics data here
            return new Response(JSON.stringify({
              success: true,
              message: 'Analytics data received',
              data: data
            }), {
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }
          break;

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
  },
};
