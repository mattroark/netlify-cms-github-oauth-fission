const simpleOauthModule = require('simple-oauth2');
const randomstring = require('randomstring');

const oauth2 = simpleOauthModule.create({
    client: {
        id: process.env.OAUTH_CLIENT_ID,
        secret: process.env.OAUTH_CLIENT_SECRET
    },
    auth: {
        tokenHost: process.env.GIT_HOSTNAME || 'https://github.com',
        tokenPath: process.env.OAUTH_TOKEN_PATH || '/login/oauth/access_token',
        authorizePath: process.env.OAUTH_AUTHORIZE_PATH || '/login/oauth/authorize'
    }
});

module.exports.auth = async function() {
    const authorizationUri = oauth2.authorizationCode.authorizeURL({
        redirectURI: process.env.REDIRECT_URL,
        scope: process.env.SCOPES || 'repo,user',
        state: randomstring.generate(32)
    });

    return {
        status: 302,
        headers: {
            location: authorizationUri
        }
    }
};

module.exports.callback = async function(context) {
    const oauthProvider = process.env.OAUTH_PROVIDER || 'github';

    const options = {
        code: context.request.query.code,
    };

    if (oauthProvider === 'gitlab') {
        options.client_id = process.env.OAUTH_CLIENT_ID;
        options.client_secret = process.env.OAUTH_CLIENT_SECRET;
        options.grant_type = 'authorization_code';
        options.redirect_uri = process.env.REDIRECT_URL
    }

    let mess, content;

    await oauth2.authorizationCode.getToken(options, (error, result) => {
        if (error) {
            console.error('Access Token Error', error.message);
            mess = 'error'
            content = JSON.stringify(error)
        } else {
            const token = oauth2.accessToken.create(result);
            mess = 'success'
            content = {
                token: token.token.access_token,
                provider: oauthProvider
            }
        }
    })

    const script = `
        <script>
        (function() {
          function recieveMessage(e) {
            console.log("recieveMessage %o", e)
            window.opener.postMessage(
              'authorization:${oauthProvider}:${mess}:${JSON.stringify(content)}',
              e.origin
            )
          }
          window.addEventListener("message", recieveMessage, false)
          console.log("Sending message: %o", "${oauthProvider}")
          window.opener.postMessage("authorizing:${oauthProvider}", "*")
        })()
        </script>`

    return {
        status: 200,
        headers: {
            'content-type': 'text/html'
        },
        body: script
    }
};
