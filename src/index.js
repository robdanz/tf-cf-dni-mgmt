/**
 * Cloudflare Analyst - Modern Web App UI
 * Main worker entry point with authentication and routing
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
          return new Response(await getMainPage(), {
            headers: {
              'Content-Type': 'text/html',
              ...corsHeaders
            }
          });

        case '/api/auth/validate':
          return handleAuthValidation(request, corsHeaders);

        case '/api/menu':
          return new Response(JSON.stringify(getMenuData()), {
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
  },
};

/**
 * Validate Cloudflare Access token and extract user email
 */
async function handleAuthValidation(request, corsHeaders) {
  try {
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

    // Parse the CF-Authorization token
    // Format: Bearer <token>
    const token = authHeader.replace('Bearer ', '');
    
    // For now, we'll simulate token validation
    // In production, you'd validate against Cloudflare's API
    const userEmail = await validateCloudflareToken(token);
    
    if (!userEmail) {
      return new Response(JSON.stringify({
        error: 'Invalid token',
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
        email: userEmail,
        name: userEmail.split('@')[0]
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Authentication failed',
      message: error.message,
      authenticated: false
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

/**
 * Simulate Cloudflare token validation
 * In production, validate against Cloudflare's API
 */
async function validateCloudflareToken(token) {
  // For development/demo purposes, we'll simulate validation
  // In production, you would:
  // 1. Verify the token signature with Cloudflare's public keys
  // 2. Check token expiration
  // 3. Extract user claims
  
  if (token && token.length > 10) {
    // Simulate extracting email from token
    // In real implementation, this would come from JWT claims
    return 'user@example.com';
  }
  
  return null;
}

/**
 * Get menu data structure
 */
function getMenuData() {
  return {
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
  };
}

/**
 * Generate the main HTML page
 */
async function getMainPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cloudflare Analyst</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }

        .app-container {
            display: flex;
            min-height: 100vh;
        }

        /* Sidebar */
        .sidebar {
            width: 280px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-right: 1px solid rgba(255, 255, 255, 0.2);
            display: flex;
            flex-direction: column;
            box-shadow: 2px 0 20px rgba(0, 0, 0, 0.1);
        }

        .sidebar-header {
            padding: 2rem 1.5rem;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        }

        .logo {
            font-size: 1.5rem;
            font-weight: 700;
            color: #667eea;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .logo-icon {
            font-size: 2rem;
        }

        .menu {
            flex: 1;
            padding: 1rem 0;
            overflow-y: auto;
        }

        .menu-item {
            margin: 0.25rem 1rem;
        }

        .menu-item-header {
            display: flex;
            align-items: center;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-weight: 500;
            color: #555;
        }

        .menu-item-header:hover {
            background: rgba(102, 126, 234, 0.1);
            color: #667eea;
        }

        .menu-item-header.active {
            background: rgba(102, 126, 234, 0.15);
            color: #667eea;
        }

        .menu-item-icon {
            font-size: 1.2rem;
            margin-right: 0.75rem;
            width: 20px;
            text-align: center;
        }

        .menu-item-label {
            flex: 1;
        }

        .menu-item-arrow {
            transition: transform 0.2s ease;
            font-size: 0.8rem;
            color: #999;
        }

        .menu-item-arrow.expanded {
            transform: rotate(90deg);
        }

        .submenu {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
            background: rgba(0, 0, 0, 0.02);
            border-radius: 8px;
            margin: 0.25rem 0;
        }

        .submenu.expanded {
            max-height: 200px;
        }

        .submenu-item {
            display: block;
            padding: 0.5rem 1rem 0.5rem 3rem;
            color: #666;
            text-decoration: none;
            transition: all 0.2s ease;
            border-radius: 6px;
            margin: 0.125rem 0.5rem;
        }

        .submenu-item:hover {
            background: rgba(102, 126, 234, 0.1);
            color: #667eea;
        }

        .submenu-item.active {
            background: rgba(102, 126, 234, 0.15);
            color: #667eea;
            font-weight: 500;
        }

        .sidebar-footer {
            padding: 1.5rem;
            border-top: 1px solid rgba(0, 0, 0, 0.1);
            background: rgba(0, 0, 0, 0.02);
        }

        .user-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem;
            background: rgba(102, 126, 234, 0.1);
            border-radius: 8px;
        }

        .user-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            font-size: 0.9rem;
        }

        .user-details {
            flex: 1;
            min-width: 0;
        }

        .user-name {
            font-weight: 500;
            color: #333;
            font-size: 0.9rem;
        }

        .user-email {
            font-size: 0.8rem;
            color: #666;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Main Content */
        .main-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
        }

        .content-header {
            padding: 2rem;
            background: rgba(255, 255, 255, 0.95);
            border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .content-title {
            font-size: 2rem;
            font-weight: 700;
            color: #333;
            margin-bottom: 0.5rem;
        }

        .content-subtitle {
            color: #666;
            font-size: 1.1rem;
        }

        .content-body {
            flex: 1;
            padding: 2rem;
            overflow-y: auto;
        }

        .welcome-card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
        }

        .welcome-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: #333;
            margin-bottom: 1rem;
        }

        .welcome-text {
            color: #666;
            line-height: 1.6;
            margin-bottom: 1.5rem;
        }

        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-top: 2rem;
        }

        .feature-card {
            background: rgba(255, 255, 255, 0.9);
            border-radius: 8px;
            padding: 1.5rem;
            text-align: center;
            transition: transform 0.2s ease;
        }

        .feature-card:hover {
            transform: translateY(-2px);
        }

        .feature-icon {
            font-size: 2rem;
            margin-bottom: 1rem;
        }

        .feature-title {
            font-weight: 600;
            color: #333;
            margin-bottom: 0.5rem;
        }

        .feature-description {
            color: #666;
            font-size: 0.9rem;
        }

        /* Loading and Error States */
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
            color: #666;
        }

        .error {
            background: rgba(255, 0, 0, 0.1);
            color: #d32f2f;
            padding: 1rem;
            border-radius: 8px;
            margin: 1rem 0;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            .sidebar {
                width: 100%;
                position: fixed;
                left: -100%;
                transition: left 0.3s ease;
                z-index: 1000;
            }

            .sidebar.open {
                left: 0;
            }

            .main-content {
                width: 100%;
            }

            .content-header {
                padding: 1rem;
            }

            .content-body {
                padding: 1rem;
            }
        }
    </style>
</head>
<body>
    <div class="app-container">
        <!-- Sidebar -->
        <nav class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <div class="logo">
                    <span class="logo-icon">☁️</span>
                    <span>Cloudflare Analyst</span>
                </div>
            </div>

            <div class="menu" id="menu">
                <!-- Menu items will be populated by JavaScript -->
            </div>

            <div class="sidebar-footer">
                <div class="user-info" id="userInfo">
                    <div class="user-avatar" id="userAvatar">U</div>
                    <div class="user-details">
                        <div class="user-name" id="userName">Loading...</div>
                        <div class="user-email" id="userEmail">user@example.com</div>
                    </div>
                </div>
            </div>
        </nav>

        <!-- Main Content -->
        <main class="main-content">
            <div class="content-header">
                <h1 class="content-title">Welcome to Cloudflare Analyst</h1>
                <p class="content-subtitle">Your comprehensive analytics and insights platform</p>
            </div>

            <div class="content-body">
                <div class="welcome-card">
                    <h2 class="welcome-title">Getting Started</h2>
                    <p class="welcome-text">
                        Cloudflare Analyst provides powerful tools for analyzing your Cloudflare data through intuitive visualizations and GraphQL queries. 
                        Use the sidebar menu to explore different sections and features.
                    </p>

                    <div class="feature-grid">
                        <div class="feature-card">
                            <div class="feature-icon">📊</div>
                            <h3 class="feature-title">Analytics Dashboard</h3>
                            <p class="feature-description">Comprehensive traffic, performance, and security analytics</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">🔍</div>
                            <h3 class="feature-title">GraphQL Explorer</h3>
                            <p class="feature-description">Build and execute custom GraphQL queries with ease</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon">📈</div>
                            <h3 class="feature-title">Reports & Insights</h3>
                            <p class="feature-description">Generate custom reports and export data for analysis</p>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <script>
        // Global state
        let currentUser = null;
        let menuData = null;

        // Initialize the application
        async function init() {
            try {
                await validateAuth();
                await loadMenu();
                setupEventListeners();
            } catch (error) {
                console.error('Initialization error:', error);
                showError('Failed to initialize application');
            }
        }

        // Validate authentication
        async function validateAuth() {
            try {
                const response = await fetch('/api/auth/validate', {
                    headers: {
                        'CF-Authorization': 'Bearer ' + getAuthToken()
                    }
                });

                if (!response.ok) {
                    throw new Error('Authentication failed');
                }

                const data = await response.json();
                currentUser = data.user;
                updateUserDisplay();
            } catch (error) {
                console.error('Auth validation error:', error);
                // For demo purposes, use mock user
                currentUser = {
                    email: 'user@example.com',
                    name: 'Demo User'
                };
                updateUserDisplay();
            }
        }

        // Get auth token (mock implementation)
        function getAuthToken() {
            // In production, this would come from Cloudflare Access
            return 'mock-token-' + Date.now();
        }

        // Load menu data
        async function loadMenu() {
            try {
                const response = await fetch('/api/menu');
                menuData = await response.json();
                renderMenu();
            } catch (error) {
                console.error('Menu loading error:', error);
                showError('Failed to load menu');
            }
        }

        // Render the menu
        function renderMenu() {
            const menuContainer = document.getElementById('menu');
            
            if (!menuData || !menuData.items) {
                menuContainer.innerHTML = '<div class="loading">Loading menu...</div>';
                return;
            }

            menuContainer.innerHTML = menuData.items.map(item => \`
                <div class="menu-item">
                    <div class="menu-item-header" onclick="toggleSubmenu('\${item.id}')">
                        <span class="menu-item-icon">\${item.icon}</span>
                        <span class="menu-item-label">\${item.label}</span>
                        <span class="menu-item-arrow" id="arrow-\${item.id}">▶</span>
                    </div>
                    <div class="submenu" id="submenu-\${item.id}">
                        \${item.subItems.map(subItem => \`
                            <a href="\${subItem.path}" class="submenu-item" onclick="selectSubmenuItem('\${subItem.id}')">
                                \${subItem.label}
                            </a>
                        \`).join('')}
                    </div>
                </div>
            \`).join('');
        }

        // Toggle submenu visibility
        function toggleSubmenu(itemId) {
            const submenu = document.getElementById(\`submenu-\${itemId}\`);
            const arrow = document.getElementById(\`arrow-\${itemId}\`);
            const header = submenu.previousElementSibling;

            if (submenu.classList.contains('expanded')) {
                submenu.classList.remove('expanded');
                arrow.classList.remove('expanded');
                header.classList.remove('active');
            } else {
                // Close other submenus
                document.querySelectorAll('.submenu.expanded').forEach(menu => {
                    menu.classList.remove('expanded');
                });
                document.querySelectorAll('.menu-item-arrow.expanded').forEach(arrow => {
                    arrow.classList.remove('expanded');
                });
                document.querySelectorAll('.menu-item-header.active').forEach(header => {
                    header.classList.remove('active');
                });

                // Open current submenu
                submenu.classList.add('expanded');
                arrow.classList.add('expanded');
                header.classList.add('active');
            }
        }

        // Select submenu item
        function selectSubmenuItem(itemId) {
            // Remove active class from all submenu items
            document.querySelectorAll('.submenu-item.active').forEach(item => {
                item.classList.remove('active');
            });

            // Add active class to selected item
            event.target.classList.add('active');
        }

        // Update user display
        function updateUserDisplay() {
            if (!currentUser) return;

            const userAvatar = document.getElementById('userAvatar');
            const userName = document.getElementById('userName');
            const userEmail = document.getElementById('userEmail');

            if (userAvatar) {
                userAvatar.textContent = currentUser.name.charAt(0).toUpperCase();
            }
            if (userName) {
                userName.textContent = currentUser.name;
            }
            if (userEmail) {
                userEmail.textContent = currentUser.email;
            }
        }

        // Show error message
        function showError(message) {
            const contentBody = document.querySelector('.content-body');
            contentBody.innerHTML = \`
                <div class="error">
                    <strong>Error:</strong> \${message}
                </div>
            \`;
        }

        // Setup event listeners
        function setupEventListeners() {
            // Add any additional event listeners here
        }

        // Initialize when DOM is loaded
        document.addEventListener('DOMContentLoaded', init);
    </script>
</body>
</html>`;
}