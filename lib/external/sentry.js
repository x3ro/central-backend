const { inspect } = require('util');
const { isBlank } = require('../util/util');


// Endpoints where query strings are sensitive and should be removed
const sensitiveEndpoints = [
  ['GET', '/users[^/]'], // ?q=<part of name or email>
  ['GET', '/projects/([^/]*)/forms/([^/]*)/submissions.csv'], // ?key=passphrase for managed encryption
  ['GET', '/projects/([^/]*)/forms/([^/]*)/draft/submissions.csv'], // ?key=passphrase for managed encryption
  ['GET', '/projects/([^/]*)/formList'], // ?st=token for enketo public link access (showing form)
  ['HEAD', '/projects/([^/]*)/formList'], // ?st=token for enketo public link access (showing form)
  ['POST', '/projects/([^/]*)/submission'], // ?st=token for enketo public link access (submitting)
];

const isSensitiveEndpoint = (request) => {
  for (const [method, endpoint] of sensitiveEndpoints) {
    if (request.method === method && request.url.match(endpoint)) {
      return true;
    }
  }
  return false;
};

const filterTokenFromUrl = (url) => {
  // remove user token from any URL
  if (url.match('/v1/key/(.*?)')) {
    return url.replace(/v1\/key\/([^/]*)/, 'v1/key/[FILTERED]');
  }

  // remove draft token from any URL
  if (url.match('/v1/test/(.*?)')) {
    return url.replace(/v1\/test\/([^/]*)/, 'v1/test/[FILTERED]');
  }

  // return original URL if there are no tokens
  return url;
};

const sanitizeEventRequest = (event) => {
  /* eslint-disable no-param-reassign */
  if (event.request) {

    // clear out all cookie values
    if (event.request.headers && event.request.headers.cookie) {
      const cookies = event.request.headers.cookie.split('; ')
        .map((cookie) => cookie.slice(0, cookie.indexOf('=')))
        .join(', ');

      event.request.headers.cookie = cookies;
    }

    // clear out cookie values not stored in request header
    if (event.request.cookies)
      event.request.cookies = null;

    // clear out Authorization header
    if (event.request.headers && event.request.headers.authorization)
      event.request.headers.authorization = null;

    // clear out referer header (from enketo submission, can have ?st=token in url)
    if (event.request.headers && event.request.headers.referer)
      event.request.headers.referer = null;

    // clear out x-action-notes
    if (event.request.headers && event.request.headers['x-action-notes'])
      event.request.headers['x-action-notes'] = null;

    // clear out request body data for all endpoints
    if (event.request.data)
      event.request.data = null;

    // remove sensitive info from URL via query string or path
    if (event.request.url) {
      // handle endpoints that might expose sensitive data through query params
      if (isSensitiveEndpoint(event.request) && event.request.query_string) {
        // remove query string from request data and from URL
        event.request.query_string = null;
        // remove it from URL, too, otherwise Sentry will find it
        event.request.url = event.request.url.split('?')[0]; // eslint-disable-line prefer-destructuring
      }

      // filter out access tokens embedded in URLs
      event.request.url = filterTokenFromUrl(event.request.url);
    }
  }

  /* eslint-enable no-param-reassign */

  return event;
};

const init = (config) => {
  if ((config == null) || isBlank(config.key) || isBlank(config.project)) {
    // return a noop object that returns the hooks but does nothing.
    return {
      Handlers: {
        requestHandler() { return (request, response, next) => next(); },
        errorHandler() { return (error, request, response, next) => next(error); }
      },
      captureException(err) {
        process.stderr.write('attempted to log Sentry exception in development:\n');
        process.stderr.write(inspect(err));
        process.stderr.write('\n');
      }
    };
  }

  // otherwise initialize Sentry with some settings we want.
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn: `https://${config.key}@sentry.io/${config.project}`,
    beforeSend(event) {
      const sanitizedEvent = sanitizeEventRequest(event);

      // only file the event if it is a bare exception or it is a true 500.x Problem.
      const error = sanitizedEvent.extra.Error;
      if (error == null) return sanitizedEvent; // we aren't sure why there isn't an exception; pass through.
      if ((error.isProblem !== true) || (error.httpCode === 500)) return sanitizedEvent; // throw exceptions.
      return null; // we have a user-space problem.
    }
  });
  return Sentry;
};

module.exports = { init, sanitizeEventRequest, isSensitiveEndpoint, filterTokenFromUrl };

