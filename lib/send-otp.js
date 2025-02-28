
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TEMPLATE_NAME = 'otp_alert'; // your template name

export async function sendOTP(mobileNumber, otp) {
  try {
    console.log('OTP:', otp);
    console.log('Mobile:', mobileNumber);

    // Format phone number to international format (remove leading 0 and add country code)
    // const formattedNumber = mobileNumber.startsWith('0') 
    //   ? `91${mobileNumber.slice(1)}` 
    //   : `91${mobileNumber}`;

    // const response = await axios({
    //   method: 'POST',
    //   url: `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    //   headers: {
    //     'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
    //     'Content-Type': 'application/json',
    //   },
    //   data: {
    //     messaging_product: "whatsapp",
    //     to: formattedNumber,
    //     type: "template",
    //     template: {
    //       name: WHATSAPP_TEMPLATE_NAME,
    //       language: {
    //         code: "en"
    //       },
    //       components: [
    //         {
    //           type: "body",
    //           parameters: [
    //             {
    //               type: "text",
    //               text: otp
    //             }
    //           ]
    //         }
    //       ]
    //     }
    //   }
    // });

    return {
      success: true,
    //   messageId: response.data.messages[0].id
      messageId: 'Implementes Later'
    };

  } catch (error) {
    // console.error('WhatsApp OTP Error:', error.response?.data || error.message);
    return {
      success: false,
    //   error: error.response?.data?.error?.message || 'Failed to send OTP'
      error: 'Implementes Later'
    };
    console.log('WhatsApp OTP Error:');
  }
}