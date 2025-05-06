import express from 'express';
import bodyParser from 'body-parser';

const app = express();
const PORT = 3000;

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
      lineEvent?: any;
    }
  }
}
app.use(bodyParser.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
// Enhanced configuration
app.use((req, res, next) => {
    console.log(`Incoming ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    console.log('Raw body:', (req as any).rawBody);
    next();
  });


// LINE Webhook Middleware
const validateLineWebhook = (req: any, res: any, next: any) => {
  try {
    console.log('Received raw body:', req.rawBody);
    
    if (!req.body) {
      throw new Error('Request body is empty');
    }

    const { events } = req.body;
    
    if (!events || !Array.isArray(events)) {
      throw new Error('Invalid payload format: events array missing');
    }

    if (events.length === 0) {
      return res.status(200).json({ status: 'no events' }); // LINE expects 200 for empty events
    }

    const event = events[0];
    
    if (!event.type) {
      throw new Error('Event type missing');
    }

    if (event.type === 'message' && (!event.message || !event.message.type)) {
      throw new Error('Message data incomplete');
    }

    req.lineEvent = event;
    next();
  } catch (error : any) {
    console.error('Validation error:', error);
    return res.status(400).json({
      error: 'Invalid webhook payload',
      details: error.message,
      expectedFormat: {
        events: [{
          type: 'message',
          message: {
            type: 'text',
            text: 'Hello'
          },
          source: {
            userId: 'U123...',
            type: 'user'
          }
        }]
      }
    });
  }
};

// LINE Webhook Handler
app.post('/user/line', validateLineWebhook, (req : any, res : any) => {
  const event = req.lineEvent;

  if (event.type === 'message' && event.message.type === 'text') {
    return res.json({
      status: 'success',
      userId: event.source.userId,
      text: event.message.text,
      replyToken: event.replyToken
    });
  }

  res.json({
    status: 'ignored',
    eventType: event.type
  });
});

// Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Health Check
app.get('/', (req, res) => {
  res.send('Webhook is running');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Configure your LINE webhook to:');
  console.log(`http://localhost:${PORT}/user/line`);
  console.log('\nTest with this payload:');

});