#!/usr/local/bin/node
/*
    File: server.js
    By: Peter Torelli
    Date: 20-SEP-2014
   
    Copyright (c) 2014 Peter J. Torelli
 
    This file is part of Arduinolyzer.js

    It provides the connection between the Arduino (via serial port) and
    the client web interface (via ajax and socket.io).

    Arduinlyzer.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Arduinlyzer.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
*/

// Arg2 is your particular TTY device...
if (process.argv.length < 3) {
  console.log("Please specify the /dev/tty* or COM* port");
  return 1;
}
var tty = process.argv[2];
console.log("Using device at: " + tty);

var 
  express = require('express'),
  app = express(),
  morgan = require('morgan'),
  formidable = require('formidable'),
  http = require('http').Server(app),
  io = require('socket.io')(http);


var analyzer = new function() {
  this.ready_for_input = false;
  this.serialport = require('serialport');
  // Prevents writing to the Arduino until "initialize" appears
  // on the serial port.
  this.ready = function() {
    return this.ready_for_input;
  };
  // We need to do this before starting the server.
  this.init = function(callback) {
    console.log('initializing serial Arduino...');
    this.port = new this.serialport.SerialPort(
      tty, {
        baudrate: 115200,
        dataBits: 8,
        parity: 'none',
        flowControl: false,
        parser: this.serialport.parsers.readline('\r')
      },
      false,
      // Error function
      function(err) { throw err; }
    );
    // JavaScript class madness
    var portobj = this.port;
    var object = this;
    // Now open the port and connect the handlers (req'd by docs)
    this.port.open(function(err) {
      var newdata = {};
      if (err) 
        throw err;
      else {
        // This is the listener callback for when the Arduino
        // wants to tell us something.
        portobj.on('data', function(data) {
          result = data.trim();
          // Slice the string b/c I don't like to fill the screen
          var logtext = result;
          if (result.length > 50) {
            logtext = result.slice(0, 50) + "...";
          }
          console.log('ArduinoData: ' + logtext);
          var m; // pattern match
          if (result == 'initialized') {
            object.ready_for_input = true;
          } else if (result == 'begindata') {
            newdata = {};
          } else if (result == 'enddata') {
            // Here's the PUSH call to the CLIENT
            io.emit('newdata', JSON.stringify(newdata));
            newdata = {};
          } else if (m = result.match(/(\S+): (\d+)/)) {
            // Key:Val pair
            var k = m[1];
            var v = m[2];
            newdata[k] = v;
          }
        });
        // Port error handler...
        portobj.on('error', function(err) {
          throw err;
        });
      }
    });
    // This might need to be as much as 3 seconds for the arduino to
    // boot (also depends on your setup loop).
    console.log('executing 3s delay for port to init...');
    setTimeout(function() {
      callback();
    }, 3000);
  };
  // This is how we send commands to the Arduino...
  this.write = function(data) {
    this.port.write(data, function(err) {
      if (err)
        throw err;
    });
  };
}

// love love love this middleware
app.use(morgan('dev'));

app.post('/start', function(req, res, next) {
  // Don't let the user send data if the Arduino isn't ready
  if (!analyzer.ready()) {
    console.error('Arduino has not sent "initialized" yet');
    res.end();
  } 
  // The client sends a POST to /start to begin sampling
  else {
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files) {
      if (err) {
        console.error('Form parse error: ' + err);
        res.end();
      } else {
        if (fields.config == undefined) {
          console.error('config field not found');
        } else {
          console.log('ClientData: ' + fields.config);
          // Since the config has already been built by the client,
          // all we have to do is write it to the Arduino
          analyzer.write(fields.config);
        }
        res.end();
      }
    });
  }
});

// Everything else is served from /public as static pages
app.use('/', express.static(__dirname + '/public'));

// Use the init function callback to start the server
analyzer.init(function() {
  http.listen(8080);
  console.log('Server ready');
});


    

