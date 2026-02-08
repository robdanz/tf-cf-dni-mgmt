export default function render() {
  return `
    <div class="card">
      <h2 style="margin-bottom: 1rem;">Getting Started</h2>
      <p style="color: #666; line-height: 1.6;">
        Cloudflare Analyst provides visual utilities for the Cloudflare One environment.
        Use the sidebar to explore analytics, reports, and TLS Auto Pilot list management.
      </p>
      <div style="margin-top: 1.5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
        <div style="padding: 1rem; background: #f8f9fa; border-radius: 8px; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📊</div>
          <div style="font-weight: 600;">Analytics</div>
          <div style="font-size: 0.9rem; color: #666;">Traffic & network metrics</div>
        </div>
        <div style="padding: 1rem; background: #f8f9fa; border-radius: 8px; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📈</div>
          <div style="font-weight: 600;">Reports</div>
          <div style="font-size: 0.9rem; color: #666;">TLS Auto Pilot lists</div>
        </div>
      </div>
    </div>
  `;
}
