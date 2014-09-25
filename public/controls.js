/*
    File: controls.js
    By: Peter Torelli
    Date: 20-SEP-2014

    Copyright (c) 2014 Peter J. Torelli
    
    This file is part of Arduinolyzer.js

    It provides the primary control functionality of the user interface.

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

// Some lovely global variables...
// The url for the AJAX and socket.io com
var gurl = 'http://localhost:8080';
// Data sent back from the server arrives on the gsocket
var gsocket = io.connect(gurl);
// Render zoom
var gzoom = 1;
// Sample data
var gdata = {};
// The main data canvas
var gcanvas = $('canvas#data')[0];
// The main drawing context
var g2d = gcanvas.getContext('2d');
// Set some defaults for the context
g2d.translate(0.5, 0.5);
g2d.lineCap = 'square';
g2d.lineWidth = 0.5;
g2d.lineJoin = 'miter';

// This is a useful routine that provides text-string feedback to 
// the user indicating the sample mode defined by the input settings.
function update_mode() {
  var text_mode = [
    'Interval sampling with no trigger (immediate)',
    'Error: Trigger requested, but no edge type',
    'Sample on every trigger fall',
    'Interval sampling after falling trigger',

    'Sample on every trigger rise',
    'Interval sampling after rising trigger',
    'Sample on every changing trigger',
    'Interval sampling after changing trigger'
  ];
  var mode = 0;
  mode |= $('input#rise').is(':checked') ? (1 << 2) : 0;
  mode |= $('input#fall').is(':checked') ? (1 << 1) : 0;
  mode |= $('input#once').is(':checked') ? (1 << 0) : 0;
  $('div#summary').text(text_mode[mode]);
  return mode;
}

// Convert the input contols into a config string for the arduinolyzer
function build_config() {
  // Convert the interval inputs into a microsecond value
  var interval = $('input#interval').val();
  var unit = $('select#unit').val();
  interval *= (unit == 'ms') ? 1000 : (unit == 'us') ? 1 : 1000000;
  // Begin the command string
  var command = 'reset%';
  command += $('input#rise').is(':checked') ? 'rising%' : '';
  command += $('input#fall').is(':checked') ? 'falling%' : '';
  command += $('input#once').is(':checked') ? 'once%' : '';
  command += 'time%' + interval + '%';
  command += $('input#ch1').is(':checked') ? 'ch1%' : '';
  command += $('input#ch2').is(':checked') ? 'ch2%' : '';
  command += $('input#ch3').is(':checked') ? 'ch3%' : '';
  command += $('input#ch4').is(':checked') ? 'ch4%' : '';
  command += 'limit%';
  command += $('input#limit').val() / 8;
  command += '%';
  // This will launch the collection
  command += 'start%';
  var mode = update_mode();
  if (mode == 1) {
    alert("Please choose an edge type for your trigger.");
    return '';
  } else {
    console.log(command);
    return command;
  }
}

// Draw one channel's data
function render_channel(channel, color, data) {
  var channel_height = gcanvas.height / 4;
  var width = gcanvas.width;
  var wave_height = 20;
  var mid = (channel_height / 2) + (channel_height * (channel - 1));
  var samples = data.length;
  var pps = width / samples;
  // Starting point for the trace
  var xpos = 0;
  var ypos = data[0] == '1' ? mid - wave_height : mid;
  // Render the axis guide box
  g2d.fillStyle = '#eee';
  g2d.fillRect(0, mid - (2 * wave_height), width, (3 * wave_height)); 
  // Render the trace
  g2d.beginPath();
  g2d.moveTo(xpos, ypos);
  for (var i = 0; i < samples; ++i) {
    g2d.lineTo(xpos, ypos);
    ypos = data[i] == '0' ? mid : mid - wave_height;
    g2d.lineTo(xpos, ypos);
    xpos += pps;
  }
  g2d.lineTo(xpos + pps, ypos);
  g2d.strokeStyle = color;
  g2d.stroke();
  g2d.closePath();
}

// Generic render() routine that can be called anywhere when there
// is new data available.
function render() {
  g2d.clearRect(0, 0, gcanvas.width, gcanvas.height);
  if (gdata['ch1'] != undefined) 
    render_channel(1, 'red', gdata.ch1);
  if (gdata['ch2'] != undefined) 
    render_channel(2, 'blue', gdata.ch2);
  if (gdata['ch3'] != undefined) 
    render_channel(3, 'green', gdata.ch3);
  if (gdata['ch4'] != undefined) 
    render_channel(4, 'orange', gdata.ch4);
}

// Change the status of the start/stop button
function start_stop(mode) {
  if (mode == 'start') {
    $('div.button#start').text('Start').css('background', 'dodgerblue');;
  } else if (mode == 'wait') {
    $('div.button#start').text('Wait').css('background', 'red');;
  }
}

// Launch the config to the server, and on to the arduinolyzer
$('div.button#start').on('click', function(e) {
  var config = build_config();
  if (config == '') 
    return;
  // The status of the start button changes when the data returns
  start_stop('wait');
  // do this for each new collection
  gzoom = 1;
  resize();
  var data = { config: config };
  $.ajax(gurl + '/start', {
    data: data,
    dataType: 'text',
    error: function(jqXHR, status, err) {
      console.log('ajax error : ' + err);
    },
    type: 'POST'
  });
});

// The data from the AJAX request returns via socket.io
gsocket.on('newdata', function(data) {
  gdata = JSON.parse(data);
  render();
  start_stop('start');
});

// I like to update the status mode every time an input changes
$('input').on('change', function(e) {
  update_mode();
});

// Input validation on the interval
$('input#interval').on('change', function() {
  if ($(this).val() < 0) {
    $(this).val(0);
  }
});

// This is used in two places, so I made it a func
function resize() {
  var px = $('div#screen').css('width').replace(/px/, '') * gzoom;
  $('canvas#data').attr({width: px});
}

// Input validation on the sample limit
$('input#limit').on('change', function() {
  if ($(this).val() % 96 != 0) {
    alert("The sample limit must be a multiple of 96");
    $(this).val(960);
  }
  if ($(this).val() > 8640) {
    $(this).val(8640);
  }
  if ($(this).val() < 96) {
    $(this).val(96);
  }
});

// Resize the canvas and re-render when zooming
$('div.zoomer').on('click', function(e) {
  if (e.target.id == 'minus')
    gzoom -= .75;
  else 
    gzoom += .75;
  gzoom = gzoom < 1 ? 1 : gzoom;
  resize();
  render();
});

$(function() {
  // Probably a better way to do this with CSS: I want the 
  // #screen and canvas to fill the parent div's height which
  // is known after the config panel renders (b/c different browsers
  // render different font padding which messes up fixed heights.
  $('div#screen')
    .css('height', $('div#config').css('height'))
    .show()
  ;
  var w = $('div#screen').css('width');
  var h = $('div#screen').css('height');
  $('canvas#data').attr({width: w, height: h});
  // Print initial conditions of default setup
  update_mode();
});

