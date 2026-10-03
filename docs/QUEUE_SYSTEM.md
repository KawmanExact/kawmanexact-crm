# BullMQ Queue System

## Overview

The Kawman ExAct dashboard uses BullMQ for background job processing. This enables asynchronous handling of:

- **Email notifications** - Transactional emails (password reset, invites, alerts)
- **Webhook deliveries** - External integrations with retry logic
- **AI report generation** - Long-running AI operations
- **File processing** - Virus scanning, OCR, thumbnails
- **In-app notifications** - Real-time user notifications

## Setup

### 1. Install Redis

**Local Development:**
```bash
docker run -d -p 6379:6379 redis:alpine
```

**Production:**
Use a managed Redis service (AWS ElastiCache, Redis Cloud, Upstash, etc.)

### 2. Configure Environment

Add to `.env`:
```env
REDIS_URL="redis://localhost:6379"
QUEUE_PREFIX="kawman"
AUTO_START_WORKERS="true"
```

### 3. Start Workers

**Development:** Workers start automatically when `AUTO_START_WORKERS=true`.

**Production:** Run workers as a separate process.

## Usage

### Adding Jobs to Queues

```typescript
import { queueEmail, queueNotification, queueWebhook } from '@/services/queue.service'

// Queue an email
await queueEmail({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<p>Welcome to Kawman ExAct</p>',
})

// Queue a notification
await queueNotification({
  organizationId: 'org-123',
  userId: 'user-456',
  type: 'NEW_LEAD',
  title: 'New Lead Assigned',
  message: 'You have been assigned a new lead',
})

// Queue a webhook
await queueWebhook({
  url: 'https://example.com/webhook',
  event: 'lead.created',
  payload: { leadId: '123', name: 'Acme Corp' },
  secret: 'webhook-secret',
  organizationId: 'org-123',
  integrationId: 'int-456',
})
```

## Queue Types

| Queue | Purpose | Concurrency | Retries | Priority |
|-------|---------|-------------|---------|----------|
| `email` | Transactional emails | 10 | 3 | High (1) |
| `notification` | In-app notifications | 20 | 3 | Medium (2) |
| `webhook` | External webhooks | 5 | 5 | Low (3) |
| `ai-report` | AI report generation | 2 | 2 | Medium (2) |
| `file-processing` | Virus scan, OCR | 3 | 3 | Low (3) |

## Monitoring

### API Endpoint

```bash
GET /api/admin/queues
```

### Programmatic Access

```typescript
import { getAllQueueStats } from '@/lib/queue'

const stats = await getAllQueueStats()
console.log(stats)
```

## Error Handling

Failed jobs are automatically retried with exponential backoff. After all retries are exhausted, jobs are moved to the failed queue and kept for 7 days.

## Testing

```bash
# Run tests (requires Redis)
REDIS_URL=redis://localhost:6379 npm test
```

## Best Practices

1. **Keep jobs small**: Pass IDs, not full objects
2. **Use idempotency**: Jobs may be retried
3. **Handle errors gracefully**: Log and throw for retries
4. **Monitor queue depth**: Alert on high backlog
5. **Set appropriate timeouts**: Don't let jobs run forever

## References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/docs/)
