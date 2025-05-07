import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express();
const PORT = 3000;

const LINE_CHANNEL_ACCESS_TOKEN = '6jBuSgWaV7deKdQx30E1X4qs57vH2oNZ79sZUuujgpD/WzT+ReXXhs5zQbNHwVFNHzrRn4caNbQN+yEAVktovXPZuRx+txPFFD2sknsNjcl6h5kgin2q7aPa/T19fPujuVS6Z5xyuATijYqLWW5GlwdB04t89/1O/w1cDnyilFU='; // 🔒 Replace with secure environment variable
const RASA_ENDPOINT = 'http://localhost:5005/webhooks/rest/webhook';

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

// Middleware to log requests
app.use((req, res, next) => {
  console.log(`Incoming ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Raw body:', req.rawBody);
  next();
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
