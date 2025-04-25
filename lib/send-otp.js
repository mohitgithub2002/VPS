// import axios from 'axios';
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TEMPLATE_NAME = 'otp_verification'; // your template name

export async function sendOTP(mobileNumber, otp) {
  try {
    console.log('OTP:', otp);
    console.log('Mobile:', mobileNumber);

    // Format phone number to international format (remove leading 0 and add country code)
    const formattedNumber = mobileNumber.startsWith('0') 
      ? `91${mobileNumber.slice(1)}` 
      : `91${mobileNumber}`;
    console.log(formattedNumber);
    const response = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: 'individual',
        to: formattedNumber,
        type: "template",
        template: {
          name: WHATSAPP_TEMPLATE_NAME,
          language: {
            code: "en_US"
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: otp
                }
              ]
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [
                {
                  type: "text",
                  text: otp
                }
              ]
            }
          ]
        }
      })
    });
    const data = await response.json();
    console.log(data);

    return {
      success: true,
      messageId: data.messages[0].id
    };

  } catch (error) {
    console.error('WhatsApp OTP Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || 'Failed to send OTP'
    };
  }
}