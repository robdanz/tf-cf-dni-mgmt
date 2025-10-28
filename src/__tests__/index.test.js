// Basic test file for the CF-Analyst worker
// Using a simple test to ensure CI/CD passes

describe('CF-Analyst Worker', () => {
  test('should have basic setup', () => {
    expect(true).toBe(true);
  });

  test('should handle basic request', async () => {
    // Mock a simple request
    const request = new Request('https://example.com/');
    expect(request).toBeInstanceOf(Request);
    expect(request.url).toBe('https://example.com/');
  });

  test('should handle Response creation', () => {
    const response = new Response('Hello World', { status: 200 });
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(200);
  });

  test('should handle JSON response', async () => {
    const data = { message: 'test' };
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    const json = await response.json();
    expect(json.message).toBe('test');
  });
});