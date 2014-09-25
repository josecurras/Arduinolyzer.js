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

var 
  express = require('express'),
  app = express(),
  morgan = require('morgan'),
  formidable = require('formidable'),
  http = require('http').Server(app),
  io = require('socket.io')(http);

var read_for_input = false;

var analyzer = new function() {
  this.serialport = require('serialport');
  this.init = function(callback) {
    console.log('initializing serial Arduino...');
    this.port = new this.serialport.SerialPort(
      '/dev/tty.usbmodem1411', {
        baudrate: 115200,
        dataBits: 8,
        parity: 'none',
        flowControl: false,
        parser: this.serialport.parsers.readline('\r')
      },
      false,
      function(err) {
        if (err) 
          throw err;
        else 
          console.log('instantiated');
      }
    );
    var portobj = this.port;
    this.port.open(function(err) {
      var newdata = {};
      if (err) 
        throw err;
      else {
        portobj.on('data', function(data) {
          result = data.trim();
          // Slice the string b/c I don't like to fill the screen
          console.log('ArduinoData: ' + result.slice(0, 40));
          var m;
          if (result == 'initialized') {
            ready_for_input = true;
          } else if (result == 'begindata') {
            newdata = {};
          } else if (result == 'enddata') {
            io.emit('newdata', JSON.stringify(newdata));
            newdata = {};
          } else if (m = result.match(/(\S+): (\d+)/)) {
            // Key:Val pair
            var k = m[1];
            var v = m[2];
            newdata[k] = v;
          }
        });
        portobj.on('error', function(err) {
          throw err;
        });
      }
    });
    console.log('executing 1s delay for port to init...');
    setTimeout(function() {
      callback();
    }, 1000);
  };
  this.write = function(data) {
    this.port.write(data, function(err) {
      if (err)
        throw err;
    });
  };
}

app.use(morgan('dev'));

app.post('/start', function(req, res, next) {
  if (!ready_for_input) {
    console.error('Arduino has not sent "initialized" yet');
    res.end();
  } else {
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
          analyzer.write(fields.config);
        }
        res.end();
      }
    });
  }
});

app.use('/', express.static(__dirname + '/public'));

analyzer.init(function() {
  http.listen(8080);
  console.log('Server ready');
});


    

