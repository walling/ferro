# Ferocious Error Handling in Node.JS

Welcome to `ferro`, a module that wants to improve the error handling experience in your Node.JS application.

It's work in progress, but you can already use it:

```javascript
require('stack-chain'); // Optional; if you want support for JSON error traces.

var ferro = require('ferro');

// Simple usage:

console.log(ferro('MyError', 'Oups!').toString()); // "[MyError: Oups!]"
console.log(ferro('MyError') instanceof Error); // true
console.log(ferro('MyError') instanceof ferro.getClass('MyError')); // true
console.log(ferro('MyError').toJSON()); // ... look for yourself :-)

// Use native error objects:

console.log(ferro('TypeError', 'Expected string.'));
console.log(ferro('TypeError', 'Expected string.').toJSON()); // Still works!

// Atrribute your errors with extra information:

console.log(ferro('CustomError', {
  message: 'Should not happen!',
  code: 'SHNHAP',
  time: new Date()
}).toJSON());

// Hoist errors, giving them a new name:

var databaseError = ferro('DatabaseError', 'Could not find user `foo`.');
console.log(ferro('AuthenticationFailure', databaseError).toJSON());

// Layering errors using the `cause` property:

var networkError = ferro('Error', 'TCP connection timeout');
console.log(ferro('BackendError', { cause: networkError }).toJSON());

// Advanced usage:

function readTextFile(filename, callback) {
  require('fs').readFile(filename, 'utf8', function(error, content) {
    if (error) {
      if (error.code === 'ENOENT') {
        return callback(ferro('FileNotFound', {
          message: 'The file does not exist: ' + filename,
          cause: error
        }));
      } else {
        return callback(ferro('Error', {
          message: 'Could not read file: ' + filename,
          cause: error
        }));
      }
    }

    callback(null, content);
  });
}

// Serve errors as JSON response over HTTP:

require('http').createServer(function(request, response) {
  readTextFile('file.txt', function(error, content) {
    var responseBody;
    var status = 200;

    if (error) {
      if (error.name === 'FileNotFound') {
        responseBody = ferro('NotFound', error);
        status = 404;
      } else {
        responseBody = ferro('ServerError', error);
        status = 500;
      }
    } else {
      responseBody = { content: content };
    }

    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(responseBody, null, 2) + '\n');
  });
}).listen(8080);

console.log('\nGo to http://localhost:8080/');
// Try creating `file.txt`, remove it again. Create a dir `file.txt`, ...
```

### Want it?

It is as simple as `npm install ferro`
