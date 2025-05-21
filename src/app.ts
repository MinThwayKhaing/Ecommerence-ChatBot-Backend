import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import chalk from 'chalk';
import dayjs from 'dayjs';

const app = express();
const PORT = 3000;

const LINE_CHANNEL_ACCESS_TOKEN = 'Or2pu2Rd1w+JJdxy0AtnPZ0i7z88uq2qH683+Id3sQx0mqI+Fd2vWn2ES5Fh9IDrUAQyPgSPqKjehuC0T/CQMy2sGKATVwDwNEs4D+9GQjND8IwlMbwYjUG0eoS9xzifVaV0ctV2TSJQVhj82F1X8QdB04t89/1O/w1cDnyilFU='; // 🔒 Replace with secure environment variable
const RASA_ENDPOINT = 'http://localhost:5005/webhooks/rest/webhook';
const FACEBOOK_PAGE_ACCESS_TOKEN='EAAQLPtfjYSEBO9LJHuh6zjqqCEBIqhaPFIpm9k3QnOYYDuxRMidU2qxVCH2t3fQRmZCSEwUUhZAZBLffQz8of1oP0BhwKHxZCaKBHbdlnBuqFBN2VsiGP246EUyx9bWI7qkdEZBDSaPsdCVcrqG4WZArwZCOa5Qu9KwRaZBVYFRVOh2TbPLZAZAeCZC0WcypuY8'
// const FACEBOOK_VERIFY_TOKEN = 'EAAQLPtfjYSEBOZB19qpCieKeWulSeUSuc7aB2IAti9S3KNlWszdsqaUox0gB2kZA2m32SELW1OWhkBuAzm8oZBi8bSOZBfwkr9LokurMIHbvPDOYEYF8ofuE56xKkE3MzN3U3m6KZCzV3IHNNoWe3TZA7s6I4yEkhZAT8rZCK2ZCvY0s8gsqF5T96P7dtxjzjHz8k'; 
const FACEBOOK_VERIFY_TOKEN = 'my_super_secret_token_123'
declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

app.use(bodyParser.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

app.use((req, res, next) => {
  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss.SSS');
  const method = chalk.cyan(req.method);
  const url = chalk.green(req.url);
  const status = chalk.bold.yellow('→ waiting...');
  
  console.log(`${chalk.gray(timestamp)} ${method} ${url} ${status}`);
  next();
});

app.use(bodyParser.json());

// Verify token endpoint (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if verification tokens match
  if (mode === 'subscribe' && token === FACEBOOK_VERIFY_TOKEN) {
    console.log('Webhook verified!');
    res.status(200).send(challenge);
  } else {
    console.log('Verification failed: Invalid token or mode');
    res.sendStatus(403); // Reject if tokens don't match
  }
});

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      for (const event of entry.messaging) {
        const senderId = event.sender.id;

        if (event.message && event.message.text) {
          const userMessage = event.message.text;
          console.log('✅ Received message from user:', userMessage);

          try {
            // Send user's message to Rasa
            const rasaResponse = await axios.post(RASA_ENDPOINT, {
              sender: senderId,
              message: userMessage
            });

            const rasaText = rasaResponse.data?.[0]?.text || "I'm not sure how to respond to that.";
            let messageToSend;

            // Try to parse as product JSON if includes "products"
            if (rasaText.includes('"products"')) {
              try {
                const parsed = JSON.parse(rasaText);
                const elements = parsed.products.map((product: any) => ({
                  title: product.name,
                  subtitle: `Availability: ${product.availability}\nPrice: $${product.price}`,
                  image_url: `https://via.placeholder.com/150?text=${encodeURIComponent(product.name)}`,
                  buttons: [
                    {
                      type: "postback",
                      title: "Order Now",
                      payload: `ORDER_${product.id}`
                    }
                  ]
                }));

                messageToSend = {
                  attachment: {
                    type: "template",
                    payload: {
                      template_type: "generic",
                      elements
                    }
                  }
                };
              } catch (parseErr) {
                console.error('❌ Error parsing product JSON:', parseErr);
                messageToSend = { text: "Sorry, something went wrong displaying the products." };
              }
            } else {
              // Fallback to plain text message
              messageToSend = { text: rasaText };
            }

            // Send message to Facebook Messenger
            await axios.post(
              `https://graph.facebook.com/v12.0/me/messages?access_token=${FACEBOOK_PAGE_ACCESS_TOKEN}`,
              {
                recipient: { id: senderId },
                message: messageToSend
              }
            );

            console.log('🤖 Replied with:', messageToSend);
          } catch (err: any) {
            console.error('❌ Error sending message:', err.response?.data || err.message);
          }
        } else {
          console.log('⚠️ Non-text or unknown event:', event);
        }
      }
    }

    res.sendStatus(200); // Respond to Facebook to avoid re-sending
  } else {
    res.sendStatus(404);
  }
});



// Reply with plain text
const replyToUser = async (replyToken: string, text: string) => {
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken,
        messages: [{ type: 'text', text }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    );
  } catch (error: any) {
    console.error('Reply error:', error.response?.data || error.message);
  }
};
const replyWithProductList = async (products: any[], replyToken: string) => {
  try {
    const flexBubbles = products.map((product: any, index: number) => ({
      type: "bubble",
      hero: {
        type: "image",
        url: `https://picsum.photos/200/150?random=${index + 1}`,
        size: "full",
        aspectRatio: "20:13",
        aspectMode: "cover"
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: product.name,
            weight: "bold",
            size: "xl",
            color: "#333333"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "lg",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: `Availability: ${product.availability}`,
                wrap: true,
                color: product.availability === "Available" ? "#00C853" : "#D50000",
                size: "md"
              },
              {
                type: "text",
                text: `Price: $${product.price}`,
                wrap: true,
                size: "sm",
                margin: "md"
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: {
              type: "message",
              label: "More Info", // Initial button for more info
              text: `more_info_product_id:${product.id}` // Action to show more info
            }
          }
        ]
      }
    }));

    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      {
        replyToken,
        messages: [
          {
            type: "flex",
            altText: "Product Offers",
            contents: {
              type: "carousel",
              contents: flexBubbles
            }
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        }
      }
    );
  } catch (error: any) {
    console.error('Flex message error:', error.response?.data || error.message);
  }
};

const LINE_SHOP_API = 'https://api.line.me/shop/v2/items'; // LINE Shop API endpoint



app.post('/user/line', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    const replyToken = event.replyToken;
    const userMessage = event.message?.text;
    const userId = event.source?.userId;

    if (!userMessage || !replyToken) {
      continue;
    }

    try {
      // Handle "More Info" Action
      if (userMessage.startsWith('more_info_product_id:')) {
        const productId = userMessage.split(':')[1];

        // Find product details (mocking product data here)
        const product = {
          id: productId,
          name: 'Product Name',
          price: '99.99',
          availability: 'Available',
          description: 'This is a detailed product description.'
        };

        // Respond with updated Flex message showing "Buy Now" and "Add to Cart"
        const flexBubble = {
          type: "bubble",
          hero: {
            type: "image",
            url: `https://picsum.photos/200/150?random=${productId}`,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover"
          },
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: product.name,
                weight: "bold",
                size: "xl",
                color: "#333333"
              },
              {
                type: "text",
                text: product.description,
                wrap: true,
                size: "md",
                margin: "lg"
              },
              {
                type: "text",
                text: `Price: $${product.price}`,
                wrap: true,
                size: "sm",
                margin: "md"
              }
            ]
          },
          footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
              {
                type: "button",
                style: "primary", // Highlighted button
                height: "sm",
                action: {
                  type: "message",
                  label: "Buy Now", // Buy Now button
                  text: `buy_product_id:${product.id}` // Action for buying
                }
              },
              {
                type: "button",
                style: "secondary", // Secondary button for Add to Cart
                height: "sm",
                action: {
                  type: "message",
                  label: "Add to Cart", // Add to Cart button
                  text: `add_to_cart_product_id:${product.id}` // Action for adding to cart
                }
              }
            ]
          }
        };

        await axios.post(
          'https://api.line.me/v2/bot/message/reply',
          {
            replyToken,
            messages: [
              {
                type: "flex",
                altText: "Product Info",
                contents: flexBubble
              }
            ]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
            }
          }
        );
      } else {
        const { data: rasaResponse } = await axios.post(RASA_ENDPOINT, {
          sender: userId,
          message: userMessage
        });

        const modelText = rasaResponse[0]?.text;

        let parsed;
        try {
          parsed = JSON.parse(modelText);
        } catch (err) {
          parsed = null;
        }

        if (parsed?.products) {
          await replyWithProductList(parsed.products, replyToken);
        } else {
          await replyToUser(replyToken, modelText || "Sorry, I didn't understand that.");
        }
      }

    } catch (error: any) {
      console.error("Error handling message:", error.message);
      await replyToUser(replyToken, "Something went wrong. Please try again later.");
    }
  }

  res.sendStatus(200);
});

// Start server
app.listen(PORT, () => {
  console.log(`LINE bot server is running on http://localhost:${PORT}`);
});
