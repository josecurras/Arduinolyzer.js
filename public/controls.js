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
    along with Arduinolyzer.js.  If not, see <http://www.gnu.org/licenses/>.
*/

// The url for the AJAX and socket.io com
var gURL = 'http://localhost:8080';

// The viewport which renders channels, zooms, and scrolls
var viewport = new function() {
  // TODO pass this on init instead of singleton hardcode
  this.canvas = $('canvas#data');

  this.ctx = this.canvas[0].getContext('2d');
  this.ctx.translate(0.5, 0.5);
  this.ctx.lineCap = 'square';
  this.ctx.lineWidth = 0.5;
  this.ctx.lineJoin = 'miter';

  this.zoomFactor = 1;

  var that = this;

  this.clear = function() {
    that.ctx.clearRect(0, 0, that.canvas.width, that.canvas.height);
  }

  this.resize = function() {
    // TODO use parent instead of hardcode
    var w = $('div#screen').css('width').replace(/px/, '') 
          * that.zoomFactor;
    var h = $('div#screen').css('height');
    that.canvas.attr({width: w, height: h});
  }

  this.renderChannel = function(chnum, color) {
    var chname = 'ch' + chnum;
    if (that.data[chname] == undefined)
      return;
    var data = that.data[chname];
    // Pull some data from the canvas and data
    var samples = data.length;
    var width = that.canvas[0].width;
    var channel_height = that.canvas[0].height / 4;
    // Buld some rendering parameter limits
    var wave_height = 20;
    var mid = (channel_height / 2) + (channel_height * (chnum - 1));
    var pps = width / samples;
    // Starting point for the trace
    var xpos = 0;
    var ypos = data[0] == '1' ? mid - wave_height : mid;
    // Render the axis guide box
    that.ctx.fillStyle = '#eee';
    that.ctx.fillRect(0, mid - (2*wave_height), width, (3*wave_height)); 
    // Render the trace's line
    that.ctx.beginPath();
    that.ctx.moveTo(xpos, ypos);
    for (var i = 0; i < samples; ++i) {
      that.ctx.lineTo(xpos, ypos);
      ypos = data[i] == '0' ? mid : mid - wave_height;
      that.ctx.lineTo(xpos, ypos);
      xpos += pps;
    }
    that.ctx.lineTo(xpos + pps, ypos);
    that.ctx.strokeStyle = color;
    that.ctx.stroke();
    that.ctx.closePath();
  }

  this.render = function() {
    that.clear();
    that.renderChannel(1, 'red');
    that.renderChannel(2, 'blue');
    that.renderChannel(3, 'green');
    that.renderChannel(4, 'orange');
  }

  this.setData = function(data) {
    that.data = data;
  }

  this.zoom = function(direction) {
    if (direction == "in") { 
      that.zoomFactor += 0.75;
    } else {
      that.zoomFactor -= 0.75;
      that.zoomFactor = (that.zoomFactor < 1) ? 1 : that.zoomFactor;
    }
    console.log(that.zoomFactor);
    that.resize();
    that.render();
  }
};

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

  var us = $('input#interval').val();
  var unit = $('select#unit').val();
  us *= (unit == 'ms') ? 1000 : (unit == 'us') ? 1 : 1000000;
  
  var total_ch = 0;
  if ($('input#ch1').is(':checked')) ++total_ch;
  if ($('input#ch2').is(':checked')) ++total_ch;
  if ($('input#ch3').is(':checked')) ++total_ch;
  if ($('input#ch4').is(':checked')) ++total_ch;

  var limit = $('input#limit').val();
  var runtime = limit * us / total_ch / 1e6;

  var summary = text_mode[mode];
  if (mode == 0 || mode & 1) 
    summary += ', approximately ' + runtime + ' seconds of collection.';
  
  $('div#summary').text(summary);
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
  // Prevent reentry 
  if ($('div.button#start').text() == "Wait") 
    return;
  // Do nothing if no config
  var config = build_config();
  if (config == '') 
    return;
  // The status of the start button changes when the data returns
  start_stop('wait');
  // Send the request to the server
  $.ajax(gURL + '/start', {
    data: { config: config },
    dataType: 'text',
    error: function(jqXHR, status, err) {
      console.log('ajax error : ' + err);
    },
    type: 'POST'
  });
});

// The data from the AJAX request returns via socket.io
io.connect(gURL).on('newdata', function(data) {
  viewport.setData(JSON.parse(data));
  viewport.clear();
  viewport.render();
  start_stop('start');
});

// I like to update the status mode every time an input/select changes
$('input').on('change', function() {
  update_mode();
});

$('select').on('change', function() {
  update_mode();
});

// Input validation on the interval
$('input#interval').on('change', function() {
  if ($(this).val() < 0) {
    $(this).val(0);
  }
});

// Input validation on the sample limit
$('input#limit').on('change', function() {
  // Must be divisible by 12 (see sketch) bytes and
  // 8 samples per byte = 96.
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
    viewport.zoom('out');
  else
    viewport.zoom('in');
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
  // Fit the viewport to the parent div on load
  viewport.resize();
  // Print initial conditions of default setup
  update_mode();
});
