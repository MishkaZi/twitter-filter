// Open a realtime stream of Tweets, filtered according to rules
// https://developer.twitter.com/en/docs/twitter-api/tweets/filtered-stream/quick-start

const needle = require('needle');

// The code below sets the bearer token from your environment variables
// To set environment variables on macOS or Linux, run the export command below from the terminal:
// export BEARER_TOKEN='YOUR-TOKEN'
const token = process.env.BEARER_TOKEN;

const rulesURL = 'https://api.twitter.com/2/tweets/search/stream/rules';
const streamURL = 'https://api.twitter.com/2/tweets/search/stream';

// this sets up two rules - the value is the search terms to match on, and the tag is an identifier that
// will be applied to the Tweets return to show which rule they matched
// with a standard project with Basic Access, you can add up to 25 concurrent rules to your stream, and
// each rule can be up to 512 characters long

// Edit rules as desired below
const rules = [
  {
    value: 'otc merger -btc -crypto',
    tag: '#otcstocks -btc',
  },
];

//Mail
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'twitter.bot.filter@gmail.com',
    pass: 'q1w2Er4t5',
  },
});

var mailOptions = {
  from: 'TwitterBot',
  to: 'twitter.bot.filter@gmail.com',
  subject: 'OTC Merger',
  text: 'That was easy!',
};

async function getAllRules() {
  const response = await needle('get', rulesURL, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (response.statusCode !== 200) {
    console.log('Error:', response.statusMessage, response.statusCode);
    throw new Error(response.body);
  }

  return response.body;
}

async function deleteAllRules(rules) {
  if (!Array.isArray(rules.data)) {
    return null;
  }

  const ids = rules.data.map((rule) => rule.id);

  const data = {
    delete: {
      ids: ids,
    },
  };

  const response = await needle('post', rulesURL, data, {
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
  });

  if (response.statusCode !== 200) {
    throw new Error(response.body);
  }

  return response.body;
}

async function setRules() {
  const data = {
    add: rules,
  };

  const response = await needle('post', rulesURL, data, {
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(response.body);
  }

  return response.body;
}

function streamConnect(retryAttempt) {
  const stream = needle.get(streamURL, {
    headers: {
      'User-Agent': 'v2FilterStreamJS',
      Authorization: `Bearer ${token}`,
    },
    timeout: 20000,
  });

  stream
    .on('data', async (data) => {
      try {
        const json = JSON.parse(data);
        const updatedData = {
          ...json,
          link: `https://twitter.com/dosukoitintin/status/${json.data.id}`,
        };
        console.log(updatedData);
        mailOptions.text = updatedData.data.text + `\n` + updatedData.link;
        //Sending email

        await transporter.sendMail(mailOptions, function (error) {
          if (error) {
            console.log(error);
          } else {
            console.log('Email sent: ' + updatedData);
          }
        });
        // A successful connection resets retry count.
        retryAttempt = 0;
      } catch (e) {
        if (
          data.detail ===
          'This stream is currently at the maximum allowed connection limit.'
        ) {
          console.log(data.detail);
          process.exit(1);
        } else {
          // Keep alive signal received. Do nothing.
        }
      }
    })
    .on('err', (error) => {
      if (error.code !== 'ECONNRESET') {
        console.log(error.code);
        process.exit(1);
      } else {
        // This reconnection logic will attempt to reconnect when a disconnection is detected.
        // To avoid rate limits, this logic implements exponential backoff, so the wait time
        // will increase if the client cannot reconnect to the stream.
        setTimeout(() => {
          console.warn('A connection error occurred. Reconnecting...');
          streamConnect(++retryAttempt);
        }, 2 ** retryAttempt);
      }
    });

  return stream;
}

(async () => {
  let currentRules;

  try {
    // Gets the complete list of rules currently applied to the stream
    currentRules = await getAllRules();

    // Delete all rules. Comment the line below if you want to keep your existing rules.
    await deleteAllRules(currentRules);

    // Add rules to the stream. Comment the line below if you don't want to add new rules.
    await setRules();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }

  // Listen to the stream.
  streamConnect(0);
})();

// const Twit = require('twit');
// require('dotenv').config();

// const T = new Twit({
//     consumer_key: process.env.consumer_key,
//     consumer_secret: process.env.consumer_secret,
//     access_token: process.env.access_token,
//     access_token_secret: process.env.access_token_secret,
// });

// var stream = T.stream('statuses/filter', { track: 'vscode' });

// stream.on('tweet', function (tweet) {
//     console.log(tweet);
// });

// import dotenv from 'dotenv'
// // import Twitter from 'twitter-v2';
// import { ETwitterStreamEvent, TweetStream, TwitterApi, ETwitterApiError } from 'twitter-api-v2';

// dotenv.config()
// const twitterClient = new TwitterApi(process.env.BEARER_TOKEN as string);
// const roClient = twitterClient.readOnly;

// const main = async () => {
//     const jsTweets = await roClient.v2.searchAll('JavaScript', { 'media.fields': 'url' });

//     for (const tweet of jsTweets) {
//         console.log(tweet);
//     }
// }

// main()

// // const client = new Twitter({
// //     consumer_key: process.env.TWITTER_CONSUMER_KEY as string,
// //     consumer_secret: process.env.TWITTER_CONSUMER_SECRET as string,
// //     access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY as string,
// //     access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET as string,
// //     // bearer_token: process.env.BEARER_TOKEN as string
// // });

// // const main = async () => {
// //     const stream = client.stream('tweets/search/stream/rules', {});
// //     console.log(stream);
// //     // Close the stream after 30s.
// //     setTimeout(() => {
// //         stream.close();
// //     }, 30000);

// //     for await (const { data } of stream) {
// //         console.log(data);
// //     }

// // }

// // main()
