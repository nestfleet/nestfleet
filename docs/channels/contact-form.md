# Contact Form Widget Setup

NestFleet provides an embeddable contact form widget that you can add to any website. Submissions are ingested as Cases in your product inbox.

## 1. Enable the Channel

1. Log in to the NestFleet console
2. Go to **Settings** then **Channels** then **Contact Form**
3. Toggle the channel to **Enabled** for the relevant product
4. The console will display an embed snippet

## 2. Copy the Embed Snippet

After enabling, the console generates a script tag for your product. It looks like this:

```html
<script
  src="https://<your-domain>/widget.js"
  data-product-id="<PRODUCT_ID>"
  data-accent-color="#4F46E5"
  async
></script>
```

Copy the snippet from the console -- it will have your domain and product ID pre-filled.

## 3. Add to Your Website

Paste the snippet into your website's HTML, just before the closing `</body>` tag:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Your Site</title>
</head>
<body>
  <!-- your page content -->

  <script
    src="https://nestfleet.yourcompany.com/widget.js"
    data-product-id="prod_abc123"
    data-accent-color="#4F46E5"
    async
  ></script>
</body>
</html>
```

The widget renders a floating button in the bottom-right corner. When clicked, it opens a contact form overlay.

## 4. Customise Appearance

### Accent Colour

Change the `data-accent-color` attribute to match your brand:

```html
data-accent-color="#0EA5E9"
```

Use any valid hex colour code.

## 5. How It Works

1. A visitor fills in the contact form (name, email, message)
2. The widget submits the form to your NestFleet API via `POST /api/v1/signals/contact-form`
3. NestFleet creates a Case in the associated product's inbox
4. Triage and auto-reply workflows run as configured for that product

## 6. Testing

1. Add the embed snippet to a test page (or use a local HTML file)
2. Fill in the form and submit
3. Open the NestFleet console and verify a new Case appears in the product inbox
4. If the case does not appear, check the browser's developer console for network errors and review `docker compose logs api`
