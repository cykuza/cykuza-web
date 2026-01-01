import { NextRequest } from 'next/server';

// Simple in-memory rate limiter (no persistent storage)
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(req: NextRequest): { success: boolean; remaining: number } {
  // Disable rate limiting in development mode
  if (process.env.NODE_ENV === 'development') {
    return { success: true, remaining: 999 };
  }

  // Get IP address - prioritize x-forwarded-for but take first IP if multiple
  const forwardedFor = req.headers.get('x-forwarded-for');
  const ip = forwardedFor 
    ? forwardedFor.split(',')[0].trim() 
    : (req.headers.get('x-real-ip') || 'unknown');
  
  const now = Date.now();
  const windowMs = Math.max(1000, parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10));
  // Increased default from 10 to 60 requests per minute for production
  const maxRequests = Math.max(1, Math.min(1000, parseInt(process.env.RATE_LIMIT_REQUESTS || '60', 10)));

  const record = requestCounts.get(ip);
  
  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + windowMs });
    return { success: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { success: false, remaining: 0 };
  }

  record.count++;
  return { success: true, remaining: maxRequests - record.count };
}

// Clean up old entries periodically (in-memory only)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of requestCounts.entries()) {
      if (now > record.resetTime) {
        requestCounts.delete(ip);
      }
    }
  }, 60000); // Clean up every minute
}

