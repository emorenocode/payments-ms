import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Request, Response } from 'express';
import { envs, NATS_SERVICE } from 'src/config';
import { PaymentSessionDto } from 'src/payments/dto/payment-session.dto';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.stripeSecret);
  private readonly logger = new Logger('PaymentsService');

  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {}

  async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
    const { currency, items, orderId } = paymentSessionDto;
    const lineItems = items.map((item) => ({
      price_data: {
        currency,
        product_data: {
          name: item.name,
        },
        // unit_amount_decimal: item.price,
        unit_amount: Math.round(item.price * 100), // 2000 / 100 = 20.00
      },
      quantity: item.quantity,
    }));

    const session = await this.stripe.checkout.sessions.create({
      payment_intent_data: {
        metadata: {
          orderId,
        },
      },
      line_items: lineItems,
      mode: 'payment',
      success_url: envs.stripeSuccessUrl,
      cancel_url: envs.stripeCancelUrl,
    });

    // return session;

    return {
      cancelUrl: session.cancel_url,
      successUrl: session.success_url,
      url: session.url,
    };
  }

  async stripeWebhook(res: Response, req: Request) {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = envs.stripeEndpointSecret;
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        req['rawBody'],
        sig,
        endpointSecret,
      );
    } catch (error) {
      res.status(400).send(`Webhook error: ${error.message}`);
      return;
    }

    console.log({ event });
    switch (event.type) {
      case 'charge.succeeded':
        // Llamar nuestro servicio
        const chargeSucceeded = event.data.object;
        const payload = {
          stripePaymentId: chargeSucceeded.id,
          orderId: chargeSucceeded.metadata.orderId,
          receiptUrl: chargeSucceeded.receipt_url,
        };
        this.logger.log({ payload });
        this.client.emit('payment.succeeded', payload);
        break;
      default:
        console.log(`Event ${event.type} not handled`);
    }
    res.status(200).json({ sig });
  }
}
