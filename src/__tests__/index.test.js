// Basic test file for the CF-Analyst worker
const worker = require('../src/index.js');

describe('CF-Analyst Worker', () => {
  test('should handle root path', async () => {
    const request = new Request('https://example.com/');
    const response = await worker.fetch(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.message).toBe('CF-Analyst Worker is running');
  });

  test('should handle health check', async () => {
    const request = new Request('https://example.com/health');
    const response = await worker.fetch(request);
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  test('should handle analytics POST', async () => {
    const request = new Request('https://example.com/api/analytics', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ test: 'data' })
    });
    
    const response = await worker.fetch(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should handle 404 for unknown paths', async () => {
    const request = new Request('https://example.com/unknown');
    const response = await worker.fetch(request);
    
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe('Not Found');
  });
});
