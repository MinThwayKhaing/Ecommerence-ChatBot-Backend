import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

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

app.post('/user/line', validateLineWebhook, async (req : any , res : any) => {
  const event = req.lineEvent;
  const replyToken = event.replyToken;

  if (event.type === 'message' && event.message.type === 'text') {
    const receivedText = event.message.text;

    // ✅ Send reply once
    await replyToUser(replyToken, `You said: ${receivedText}`);

    return res.status(200).json({
      status: 'replied',
      userId: event.source.userId,
      text: event.message.text,
    });
  }

  // For non-message events, just return 200
  res.status(200).json({
    status: 'ignored',
    eventType: event.type,
  });
});



const LINE_CHANNEL_ACCESS_TOKEN = '6jBuSgWaV7deKdQx30E1X4qs57vH2oNZ79sZUuujgpD/WzT+ReXXhs5zQbNHwVFNHzrRn4caNbQN+yEAVktovXPZuRx+txPFFD2sknsNjcl6h5kgin2q7aPa/T19fPujuVS6Z5xyuATijYqLWW5GlwdB04t89/1O/w1cDnyilFU='; // 🔒 Replace this securely

const replyToUser = async (replyToken: string, text: string) => {
  try {
    const response = await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken,
        messages: [
          {
            type: 'text',
            text,
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );
    console.log('Reply sent:', response.data);
  } catch (error: any) {
    console.error('Failed to send reply:', error.response?.data || error.message);
  }
};
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