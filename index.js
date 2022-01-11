import needle from 'needle';
import dotenv from 'dotenv';
import Twitter from 'twitter';
import nodemailer from 'nodemailer';

dotenv.config();

const token = process.env.BEARER_TOKEN;
const rulesURL = 'https://api.twitter.com/2/tweets/search/stream/rules';
const streamURL = 'https://api.twitter.com/2/tweets/search/stream';

var client = new Twitter({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token_key: process.env.ACCESS_TOKEN_KEY,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET,
});
// (otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks)
const rules = [
  {
    value:
      '(otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) merger  -is:retweet -is:reply -is:quote lang:en',
    tag: 'Looking for mergers',
  },
  {
    value:
      '(otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) metaverse -#nft  -is:retweet -is:reply -is:quote lang:en',
    tag: 'Looking for metaverse',
  },
  {
    value:
      '(otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) ("share buyback" OR buyback)  -is:retweet -is:reply -is:quote lang:en',
    tag: 'Looking for buybacks',
  },
  {
    value:
      '(otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) covid  -is:retweet -is:reply -is:quote lang:en',
    tag: 'Looking for covid ',
  },
  {
    value:
      '(otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) (loi OR "letter of intent")  -is:retweet -is:reply -is:quote lang:en',
    tag: 'Looking for letter of intent',
  },

  // {
  //   value:
  //     '(otc OR #otc OR @otc OR otcstocks OR #otcstocks OR @otcstocks OR stocks OR #stocks OR @stocks) blockchain -#cryptocurrency -#crypto -#binance -#BTC -#nft   -is:retweet -is:reply -is:quote lang:en',
  //   tag: 'Looking for blockchain',
  // },
];

const tickerRegex = /[$][A-Z]{3,5}/g;

//Comparing tweets to find duplicates based on Levenshtein distance---------------------------------------------------------------

function similarity(s1, s2) {
  var longer = s1;
  var shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  var longerLength = longer.length;
  if (longerLength == 0) {
    return 1.0;
  }
  return (
    (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength)
  );
}

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  var costs = new Array();
  for (var i = 0; i <= s1.length; i++) {
    var lastValue = i;
    for (var j = 0; j <= s2.length; j++) {
      if (i == 0) costs[j] = j;
      else {
        if (j > 0) {
          var newValue = costs[j - 1];
          if (s1.charAt(i - 1) != s2.charAt(j - 1))
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

//---------------------------------------------------------------------------------------------------------------------------------
//Mail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL,
    pass: process.env.GMAIL_PASSWORD,
  },
});

var mailOptions = {
  from: 'TwitterBot',
  to: process.env.SEND_EMAIL_TO,
  subject: 'OTC Twitter Filter',
  text: '',
};

// ----------------------------------------------------------------------------------------------------------------
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

var last200Tweets = [];

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
          // `\n` +
          // 'Tickers in this tweet: ' +
          // json.data.text.match(tickerRegex) +
          `\n` +
          updatedData.data.text +
          `\n` +
          updatedData.link;

        mailOptions.text = body;
        console.log('Number of original tweets: ' + last200Tweets.length);
        console.log(body);

        //Checking if there is a ticker inside tweet
        if (tickerRegex.test(json.data.text)) {
          // console.log(
          //   'Tickers in this tweet: ' + json.data.text.match(tickerRegex)
          // );
          //All other tweets will be compared and decided if its similar, or not
          if (last200Tweets.length >= 1) {
            var result = 0;
            var similar = false;
            for (let i = 0; i < last200Tweets.length; i++) {
              result = similarity(last200Tweets[i], json.data.text);
              if (result >= 0.8) {
                similar = true;
                break;
              }
            }
            if (similar === false) {
              last200Tweets.push(json.data.text);
              console.log(
                '++++++++++++++++++++This is a legit tweet+++++++++++++++++++++'
              );
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
              //Sending email
              transporter.sendMail(mailOptions, function (error) {
                if (error) {
                  console.log(error);
                } else {
                  console.log('Email sent...');
                }
              });
            }
          }

          //First tweet will be added to array
          if (last200Tweets.length === 0) {
            last200Tweets.push(json.data.text);
            console.log(
              '++++++++++++++++++++This is a legit tweet+++++++++++++++++++++'
            );
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
            //Sending email
            transporter.sendMail(mailOptions, function (error) {
              if (error) {
                console.log(error);
              } else {
                console.log('Email sent...');
              }
            });
          }

          //Clear memory after 200 tweets
          if (last200Tweets.length >= 200) {
            last200Tweets = [];
          }
        } else {
          console.log(
            '---------------------This is a filler ---------------------'
          );
        }

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
