const TwitterAPI = require('twitter-api-v2').default
const functions = require('firebase-functions')
const admin = require('firebase-admin')
const axios = require('axios')
admin.initializeApp()

const dbRef = admin.firestore().doc('tokens/tags')
const callbackURL = 'YOUR_CALLBACK_URL'

const twitterClient = new TwitterAPI({
	clientId: 'YOUR_ID',
	clientSecret: 'YOUR_SECRET'
})

// Generate Auth token from 0Auth2 Twitter
exports.auth = functions.https.onRequest(async (_, response) => {
	const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
		callbackURL,
		{ scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] }
	)
	await dbRef.set({ codeVerifier, state })
	response.redirect(url)
})


// Store token sent to us from Twitter
// Stored using FireStore
exports.callback = functions.https.onRequest(async (request, response) => {
	const { state, code } = request.query

	const dbSnapshot = await dbRef.get()
	const { codeVerifier, state: storedState } = dbSnapshot.data()

	if (state !== storedState) {
		return response.status(400).send('Stored tokens do not match! Need to regenerate auth token')
	}

	const {
		client: loggedClient,
		accessToken,
		refreshToken,
	} = await twitterClient.loginWithOAuth2({
		code,
		codeVerifier,
		redirectUri: callbackURL,
	})

	await dbRef.set({ accessToken, refreshToken })

	const { data } = await loggedClient.v2.me()

	response.send(data)
})


exports.scheduledFunctionCrontab = functions.pubsub.schedule('* * * * *').onRun(async (context) => {
	const { refreshToken } = (await dbRef.get()).data()

  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(refreshToken)

  await dbRef.set({ accessToken, refreshToken: newRefreshToken })

	if (Math.round(Math.random())) {
		axios.get('https://programming-quotes-api.herokuapp.com/Quotes/random')
		.then(async axiosResp => {
			const { data } = await refreshedClient.v2.tweet(
				`${axiosResp.data.en} - ${axiosResp.data.author}`
			)
			return null
		})
	} else {
		axios.get('http://quotes.stormconsultancy.co.uk/random.json')
		.then(async axiosResp => {
			const { data } = await refreshedClient.v2.tweet(
				`${axiosResp.data.quote} - ${axiosResp.data.author}`
			)
			return null
		})
	}

	return null
})
