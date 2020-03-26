'use strict';
require('dotenv').config();
const { App, LogLevel, ExpressReceiver } = require('@slack/bolt');
const startOfISOWeek = require('date-fns/startOfISOWeek');
const endOfISOWeek = require('date-fns/endOfISOWeek');
const format = require('date-fns/format');
const NodeCache = require('node-cache');
const myCache = new NodeCache();

// Constants
const PORT = 80;
const HOST = '0.0.0.0';
const EMOJI = 'vote';

const expressReceiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

expressReceiver.app.get('/', (req, res) => {
  res.send('OK');
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: expressReceiver,
  logLevel: LogLevel.DEBUG
});

app.event('app_home_opened', async ({ event, context }) => {
  try {
    console.log('app_home_opened invoked', context.botToken);

    await app.client.views.publish({
      /* retrieves your xoxb token from context */
      token: context.botToken,

      /* the user that opened your app's app home */
      user_id: event.user,

      /* the view payload that appears in the app home*/
      view: {
        type: 'home',
        callback_id: 'home_view',

        /* body of the view */
        blocks: [
          {
            type: 'section',
            text: {
              type: 'plain_text',
              text: 'Loading...'
            }
          }
        ]
      }
    });

    const startDate = startOfISOWeek(new Date()).getTime() / 1000;
    const endDate = endOfISOWeek(new Date()).getTime() / 1000;

    const conversations = await app.client.conversations.history({
      token: context.botToken,
      channel: 'C010765FXGB'
    });

    if (!conversations.ok) {
      throw new Error('Request Failed');
    }

    const messages = conversations.messages;
    const items = messages
      .filter(
        message =>
          message.files &&
          message.files.length &&
          message.files[0].created > startDate &&
          message.files[0].created < endDate
      )
      .sort((a, b) => {
        const aReaction = a.reactions.find(reaction => reaction.name === EMOJI);
        const bReaction = b.reactions.find(reaction => reaction.name === EMOJI);

        const aCount = aReaction ? aReaction.count : 0;
        const bCount = bReaction ? bReaction.count : 0;

        if (aCount > bCount) return -1;
        if (aCount < bCount) return 1;

        const aOther = a.reactions
          .filter(reaction => reaction.name !== EMOJI)
          .reduce((sum, reaction) => sum + reaction.count, 0);

        const bOther = b.reactions
          .filter(reaction => reaction.name !== EMOJI)
          .reduce((sum, reaction) => sum + reaction.count, 0);

        if (aOther > bOther) return -1;
        if (aOther < bOther) return 1;
        return 0;
      })
      .map(message => {
        const voteReaction = message.reactions.find(
          reaction => reaction.name === EMOJI
        );

        const other = message.reactions
          .filter(reaction => reaction.name !== EMOJI)
          .reduce((sum, reaction) => sum + reaction.count, 0);

        return {
          user: message.user,
          text: message.text,
          voteReaction,
          otherCount: other
        };
      });

    const blocks = [];

    const limit = items.length > 25 ? 25 : items.length;
    for (let i = 0; i < limit; i++) {
      const item = items[i];

      let user = myCache.get(item.user);

      if (!user) {
        const userResult = await app.client.users.info({
          token: context.botToken,
          user: item.user
        });
        user = userResult.user;
        myCache.set(item.user, userResult.user);
      }

      const medal =
        i === 0
          ? ':first_place_medal:'
          : i === 1
          ? ':second_place_medal:'
          : i === 2
          ? ':third_place_medal:'
          : '';
      const text = `${medal} *${user.profile.real_name}*${
        item.text ? '\n' : ''
      }${item.text}`;

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text
        }
      });
      // accessory: {
      //   type: 'button',
      //   text: {
      //     type: 'plain_text',
      //     emoji: true,
      //     text: 'Vote'
      //   },
      //   value: 'click_me_123'
      // }
      const voteCount = item.voteReaction ? item.voteReaction.count : 0;

      const pImages = [];
      if (item.voteReaction && i === 0) {
        for (let u of item.voteReaction.users) {
          let voteUser = myCache.get(u);

          if (!voteUser) {
            const userResult = await app.client.users.info({
              token: context.botToken,
              user: u
            });
            voteUser = userResult.user;
            myCache.set(u, userResult.user);
          }

          pImages.push({
            image_url: voteUser.profile.image_24,
            alt_text: voteUser.profile.real_name
          });
        }
      }

      const imageBlocks = pImages.map(({ image_url, alt_text }) => ({
        type: 'image',
        image_url,
        alt_text
      }));

      blocks.push({
        type: 'context',
        elements: [
          ...imageBlocks,
          {
            type: 'plain_text',
            emoji: true,
            text: `${voteCount} :vote:  ${item.otherCount} other reactions`
          }
        ]
      });

      if (i < items.length - 1) {
        blocks.push({
          type: 'divider'
        });
      }
    }

    let myUser = myCache.get(event.user);

    if (!myUser) {
      const userResult = await app.client.users.info({
        token: context.botToken,
        user: event.user
      });
      myUser = userResult.user;
      myCache.set(event.user, userResult.user);
    }

    /* view.publish is the method that your app uses to push a view to the Home tab */
    await app.client.views.publish({
      /* retrieves your xoxb token from context */
      token: context.botToken,

      /* the user that opened your app's app home */
      user_id: event.user,

      /* the view payload that appears in the app home*/
      view: {
        type: 'home',
        callback_id: 'home_view',

        /* body of the view */
        blocks: [
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Last updated: ${format(new Date(), 'h:mm aaaa OOOO')}`
              }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Hello ${myUser.profile.first_name} :wave:`
              }
            ]
          },
          ...blocks
        ]
      }
    });
  } catch (error) {
    console.error(error);
  }
});

(async () => {
  // Start your app
  await app.start(PORT, HOST);

  console.log('⚡️ Bolt app is running!');
})();
