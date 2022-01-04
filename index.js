// Open a realtime stream of Tweets, filtered according to rules
// https://developer.twitter.com/en/docs/twitter-api/tweets/filtered-stream/quick-start

import needle from 'needle';
import dotenv from 'dotenv';
import Twitter from 'twitter';
dotenv.config();

// The code below sets the bearer token from your environment variables
// To set environment variables on macOS or Linux, run the export command below from the terminal:
// export BEARER_TOKEN='YOUR-TOKEN'
const token = process.env.BEARER_TOKEN;
const rulesURL = 'https://api.twitter.com/2/tweets/search/stream/rules';
const streamURL = 'https://api.twitter.com/2/tweets/search/stream';

var client = new Twitter({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token_key: process.env.ACCESS_TOKEN_KEY,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET,
});

// var params = { screen_name: 'nodejs' };
// client.post(
//   'statuses/update',
//   { status: 'I Love Twitter 2' },
//   function (error, tweet, response) {
//     if (error) throw error;
//     console.log(tweet); // Tweet body.
//     // console.log(response); // Raw response object.
//   }
// );

// this sets up two rules - the value is the search terms to match on, and the tag is an identifier that
// will be applied to the Tweets return to show which rule they matched
// with a standard project with Basic Access, you can add up to 25 concurrent rules to your stream, and
// each rule can be up to 512 characters long

// Edit rules as desired below
const rules = [
  {
    value:
      '(otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) merger -(meme OR memes) -is:retweet -is:reply -is:quote lang:en -MXSG',
    tag: 'Looking for mergers',
  },
  {
    value:
      '(otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks) metaverse -(meme OR memes) -is:retweet -is:reply -is:quote lang:en -MXSG',
    tag: 'Looking for metaverse',
  },
  {
    value:
      '(otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) ("share buyback" OR buyback) -(meme OR memes) -is:retweet -is:reply -is:quote lang:en -MXSG',
    tag: 'Looking for buybacks',
  },
  {
    value:
      '(otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) covid -(meme OR memes) -is:retweet -is:reply -is:quote lang:en -MXSG',
    tag: 'Looking for covid ',
  },
  {
    value:
      '(otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) (loi OR "letter of intent") -(meme OR memes) -is:retweet -is:reply -is:quote lang:en -MXSG',
    tag: 'Looking for letter of intent',
  },

  {
    value:
      '(otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) blockchain -(meme OR memes) -is:retweet -is:reply -is:quote lang:en -MXSG',
    tag: 'Looking for blockchain',
  },
];

async function getAllRules() {
  const response = await needle('get', rulesURL, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  console.log('Got rules');

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

  console.log('Rules deleted');

  if (response.statusCode !== 200) {
    throw new Error(JSON.stringify(response.body));
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

  console.log('Rules updated');

  if (response.statusCode !== 201) {
    throw new Error(JSON.stringify(response.body));
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
    .on('data', (data) => {
      try {
        const json = JSON.parse(data);
        const updatedData = {
          ...json,
          link: `https://twitter.com/dosukoitintin/status/${json.data.id}`,
        };
        var body =
          updatedData.matching_rules.map((rule) => rule.tag) +
          `\n` +
          updatedData.data.text +
          `\n` +
          updatedData.link;
        // console.log(body);
        console.log(JSON.stringify(data.text));

        //Sending to twitter bot
        var tweetId = json.data.id;
        client.post(
          'statuses/retweet/' + tweetId,
          function (error, tweet, response) {
            if (!error) {
              console.log('Retweet sent to twitter Bot');
            } else {
              console.log(error);
            }
          }
        );

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
  console.log('Stream connected and running');
  streamConnect(0);
})();
