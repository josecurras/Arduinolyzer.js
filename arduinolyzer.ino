/*
    File: arduinolyzer.cpp
    By: Peter Torelli
    Date: 20-SEP-2014

    Copyright (c) 2014 Peter J. Torelli
 
    This file is part of Arduinolyzer.js
 
    It provides the basic functionality, receiving configuration data
    via the serial port, sampling data via the processor's I/O, and
    returning the data via the serial port.

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

#include <String.h>

/* 
  TODO - Remove String objects, they can use too much memory
         There are some concerns here, as I'm using dynamically allocated
         strings to format data, which may run out of memory if the number
         of samples is set too high. Keep that in mind as you experiment.
*/

// MAX_BYTE_SAMPLES must be divisible by 1, 2, 3 and 4
// These are actually "macro" samples, because each sample is one bit,
// there are really 8 * MAX_BYTE_SAMPLES samples. 1,080 seems to be a multiple
// of 12 that fits in memory. I should probably use a malloc() on init,
// what with all the "String"s flying around.
#define MAX_BYTE_SAMPLES 1080
byte buffer[MAX_BYTE_SAMPLES];   

char txtbuf[20];                  // This is a generic text buffer. I'm 
                                  // switching from Strings to chars (slowly)

void (*samplefunc)(void);         // points to the proper sampling function;
                                  // each function has slight optimizations 
                                  // based on the # of channels requested

void (*delay_loop_fptr)(void);    // There are two polling functions, one for
                                  // 'us' and one for 'ms'

unsigned numsamples(0);           // number of bytes sampled & base index ptr 
                                  // into the data array
unsigned sampoff_1;               // offset in array to sample set 1
unsigned sampoff_2;               // offset in array to sample set 2
unsigned sampoff_3;               // offset in array to sample set 3
unsigned sampoff_4;               // offset in array to sample set 4

//
// Configuration variables send from the client
//
bool rising(false);               // sample on rising edge
bool falling(false);              // trigger on falling edge
bool once(false);                 // one-shot trigger
unsigned char channels(0);        // bitfield of channels to sample
int total_ch(0);                  // actual # of channels in use (# of bits in
                                  // 'channels')
unsigned long delay_us(0);        // interval for polling
                                  // ...may become delay_ms if >16383us
unsigned limit(MAX_BYTE_SAMPLES); // user selected limit of samples

//
// State-machine control variables
//
bool send_data(false);            // indicates sampling is done and data ready
bool sampling(false);             // set to indicate sampling should proceed

//
// -------------------------------------------------------- 1 CHANNEL
//
void one_ch_sample(void) {
  static byte bitpos(0);
  static byte b1(0);
  static byte rb(0);

  rb = PINB;
  // only bit is sit in channels, the channel!
  rb = rb & channels;
  // pack into the byte via bitpos
  rb = !!rb; // set to binary 0 or 1 really fast to avoid shift
  b1 |= rb << bitpos;
 
  ++bitpos;
  // if we've packed a byte's worth of data
  if (bitpos >= 8) {
    bitpos = 0;
    // store it
    buffer[numsamples] = b1;
    b1 = 0;
    ++numsamples;
    // until we run out of sample space
    if (numsamples >= limit) {
      sampling = false;
      send_data = true;
    }
  }
}

//
// -------------------------------------------------------- 2 CHANNELS
//
void two_ch_sample(void) {
  static byte bitpos(0);
  static byte b1(0);
  static byte b2(0);
  static byte bit1, bit2;
  static byte rb(0);
  
  rb = PINB;
  rb = rb & B00001111;
  
  // shift channel bits into position
  switch (channels) {
    // >> 0 will be optimized out by the compiler
    case B0011: bit1 = rb >> 0; bit2 = rb >> 1; break;
    case B0101: bit1 = rb >> 0; bit2 = rb >> 2; break;
    case B1001: bit1 = rb >> 0; bit2 = rb >> 3; break;
    case B0110: bit1 = rb >> 1; bit2 = rb >> 2; break;
    case B1010: bit1 = rb >> 1; bit2 = rb >> 3; break;
    case B1100: bit1 = rb >> 2; bit2 = rb >> 3; break;
    default: break;
  }
  
  // mask and pack channel bits
  b1 |= (bit1 & 1) << bitpos;
  b2 |= (bit2 & 1) << bitpos;
  
  ++bitpos;
  if (bitpos >= 8) {
    bitpos = 0;
    // store channel bits at their location in the buffer array
    buffer[numsamples + sampoff_1] = b1;
    buffer[numsamples + sampoff_2] = b2;
    b1 = b2 = 0;
    ++numsamples;
    if ((numsamples * 2) >= limit) {
      sampling = false;
      send_data = true;
    }
  }
}

//
// -------------------------------------------------------- 3 CHANNELS
//
void three_ch_sample(void) {
  static byte bitpos(0);
  static byte b1(0);
  static byte b2(0);
  static byte b3(0);
  static byte bit1, bit2, bit3;
  static byte rb(0);
  
  rb = PINB;
  rb = rb & B00001111;
  
  // shift channel bits into position
  switch (channels) {
    // >> 0 will be optimized out by the compiler
    case B0111: bit1 = rb >> 0; bit2 = rb >> 1; bit3 = rb >> 2; break;
    case B1011: bit1 = rb >> 0; bit2 = rb >> 1; bit3 = rb >> 3; break;
    case B1101: bit1 = rb >> 0; bit2 = rb >> 2; bit3 = rb >> 3; break;
    case B1110: bit1 = rb >> 1; bit2 = rb >> 2; bit3 = rb >> 3; break;
    default: break;
  }
  
  // mask and pack channel bits
  b1 |= (bit1 & 1) << bitpos;
  b2 |= (bit2 & 1) << bitpos;
  b3 |= (bit3 & 1) << bitpos;

  ++bitpos;
  if (bitpos >= 8) {
    bitpos = 0;
    // store channel bits at their location in the buffer array
    buffer[numsamples + sampoff_1] = b1;
    buffer[numsamples + sampoff_2] = b2;
    buffer[numsamples + sampoff_3] = b3;
    b1 = b2 = b3 = 0;
    ++numsamples;
    if ((numsamples * 3) >= limit) {
      sampling = false;
      send_data = true;
    }
  }   
}

//
// -------------------------------------------------------- 4 CHANNELS
//
void four_ch_sample(void) {
  static byte bitpos(0);
  static byte b1(0);
  static byte b2(0);
  static byte b3(0);
  static byte b4(0);
  static byte rb(0);
 
  rb = PINB;
  rb = rb & B00001111;

  // mask and pack channel bits
  b1 |= ((rb >> 0) & 1) << bitpos;
  b2 |= ((rb >> 1) & 1) << bitpos;
  b3 |= ((rb >> 2) & 1) << bitpos;
  b4 |= ((rb >> 3) & 1) << bitpos;

  ++bitpos;
  if (bitpos >= 8) {
    bitpos = 0;
    // store channel bits at their location in the buffer array
    buffer[numsamples + sampoff_1] = b1;
    buffer[numsamples + sampoff_2] = b2;
    buffer[numsamples + sampoff_3] = b3;
    buffer[numsamples + sampoff_4] = b4;
    b1 = b2 = b3 = b4 = 0;
    ++numsamples;
    if ((numsamples * 4) >= limit) {
      sampling = false;
      send_data = true;
    }
  }  
}

// Don't use a String b/c the number of bits can be large, and you'll
// run out of memory. Print one at a time (or maybe a buffer, later).
void prbits(int pos) {
  for (unsigned i = 0; i < numsamples; ++i) {
    for (unsigned j = 0; j < 8; ++j) {
      Serial.print(((buffer[i + pos] >> j) & 1) ? "1" : "0");
    }
  }
  Serial.println("");
}

// This is a bit messy: since the user can select up to four channels, 
// the code has to return the data with the correct channel name based
// on the "channels" bit field. The node.js server expects JSON format.
void send_samples(void) {
  // No really, stop interrupts
  cli();
  detachInterrupt(0);
  sei();
  
  char *ch[] = { "ch1: ", "ch2: ", "ch3: ", "ch4: " };
  int i(1), j(1), k(1);
  if (send_data == false)
    return;
  Serial.println("begindata");
  Serial.print("numsamples: ");
  Serial.println(numsamples * 8, DEC);

  switch (total_ch) {
    case 1: 
      switch (channels) {
        case B0001: i = 1; break;
        case B0010: i = 2; break;
        case B0100: i = 3; break;
        case B1000: i = 4; break;
      }
      Serial.print(ch[i-1]); prbits(sampoff_1);
      break;
    case 2: 
      switch (channels) {
        case B0011: i = 1; j = 2; break;
        case B0101: i = 1; j = 3; break;
        case B1001: i = 1; j = 4; break;
        case B0110: i = 2; j = 3; break;
        case B1010: i = 2; j = 4; break;
        case B1100: i = 3; j = 4; break;
      }  
      Serial.print(ch[i-1]); prbits(sampoff_1);
      Serial.print(ch[j-1]); prbits(sampoff_2);
      break;
    case 3: 
      switch (channels) {
        case B1110: i = 2; j = 3; k = 4; break;
        case B1101: i = 1; j = 3; k = 4; break;
        case B1011: i = 1; j = 2; k = 4; break;
        case B0111: i = 1; j = 2; k = 3; break;
      }
      Serial.print(ch[i-1]); prbits(sampoff_1);
      Serial.print(ch[j-1]); prbits(sampoff_2);
      Serial.print(ch[k-1]); prbits(sampoff_3);
      break;
    case 4:
      Serial.print(ch[0]); prbits(sampoff_1);
      Serial.print(ch[1]); prbits(sampoff_2);
      Serial.print(ch[2]); prbits(sampoff_3);
      Serial.print(ch[3]); prbits(sampoff_4);
      break;
  }
  Serial.println("enddata");
  send_data = false;
}

// the sample() function invokes the sample function pointer which
// calls the proper function based on the number of channels in use
void sample(void) {
  samplefunc();
}

void single_sample(void) {
  if (sampling)
    sample();
  else {
    send_samples();
  }
}

// The fastest loop has no delay call
void fastest_sample_loop(void) {
  while (sampling) {
    sample();
  }
  send_samples();
}

// Delay sample loop waits X number of microseconds between samples
void delay_loop_us(void) {
  Serial.println("debug: delay_loop_us()");
  while (sampling) {
    delayMicroseconds(delay_us);
    sample();
  }
  send_samples();
}

// Delay sample loop waits X number of milliseconds between samples
void delay_loop_ms(void) {
  Serial.println("debug: delay_loop_ms()");
  while (sampling) {
    delay(delay_us); // note: already divided by 1,000 during time% cmd
    sample();
  }
  send_samples();
}

// Non-trigger samples are either delayed or AS FAST AS POSSIBLE!
void sample_loop(void) {
  Serial.println("debug: sample_loop()");
  if (delay_us == 0)
    fastest_sample_loop();
  else
    delay_loop_fptr();
}

// The one-shot trigger ISR detatchs itself and fires the sample loop
void one_shot_trigger(void) {
  cli();
  detachInterrupt(0);
  sei();
  sample_loop();
}

// The clock trigger ISR calls a single sample every trigger
bool led(false);
void clock_trigger(void) {
  digitalWrite(13, led); led = !led;
  // A lot happens during single_sample
  cli();
  single_sample();
  sei();
}

// Process the command string parsed by the wait_for_serial_cmd().
// reset% clears a bunch of global variables.
// start% sets the global context and begins sampling
// The code stops sampling when the buffer fills. There's no interrupt
// mechanism to stop sampling yet, except the "reset" button. TODO
// All commands end with '%', which is not included in the string.
void route_command(String& c) {
  Serial.println("debug: route_command(" + c + ")");
  if (c == "rising") {
    rising = true;
  } else if (c == "falling") {
    falling = true;
  } else if (c == "limit") {
    // limit% provides a parameter
    wait_for_serial_command(c);
    c.toCharArray(txtbuf, 20);
    limit = strtoul(txtbuf, NULL, 10);
    Serial.println("debug: limit parameter is " + c + " samples");
  } else if (c == "time") {
    // time% provides a parameter
    wait_for_serial_command(c);
    c.toCharArray(txtbuf, 20);
    delay_us = strtoul(txtbuf, NULL, 10);
    Serial.println("debug: time parameter is " + c + " microseconds");
    if (delay_us <= 16383) { // UNO Limit
      delay_loop_fptr = &delay_loop_us;
    } else {
      delay_loop_fptr = &delay_loop_ms;
      delay_us /= 1000; // note: delay_us is now delay_ms!
    }
  } else if (c == "once") {
    once = true;
  } else if (c == "ch1") {
    channels |= B0001; ++total_ch;
  } else if (c == "ch2") {
    channels |= B0010; ++total_ch;
  } else if (c == "ch3") {
    channels |= B0100; ++total_ch;
  } else if (c == "ch4") {
    channels |= B1000; ++total_ch;
  } else if (c == "reset") {
    for (int i = 0; i < MAX_BYTE_SAMPLES; ++i)
      buffer[i] = 0;
    rising = false;
    falling = false;
    once = false;
    channels = 0;
    total_ch = 0;
    numsamples = 0;
    limit = MAX_BYTE_SAMPLES;
    detachInterrupt(0);
  } else if (c == "start") {
    if (limit > MAX_BYTE_SAMPLES) 
      limit = MAX_BYTE_SAMPLES;
    // configure the channel pointers based on how many channels
    // were selected. This partitions the array into 1, 2, 3 or 4 banks.
    if (total_ch == 1) {
      sampoff_1 = 0;
      samplefunc = &one_ch_sample;
    } else if (total_ch == 2) {
      sampoff_1 = 0;
      sampoff_2 = MAX_BYTE_SAMPLES / 2;
      samplefunc = &two_ch_sample;
    } else if (total_ch == 3) {
      sampoff_1 = 0;
      sampoff_2 = MAX_BYTE_SAMPLES / 3;
      sampoff_3 = 2 * MAX_BYTE_SAMPLES / 3;
      samplefunc = &three_ch_sample;
    } else {
      sampoff_1 = 0;
      sampoff_2 = MAX_BYTE_SAMPLES / 4;
      sampoff_3 = 2 * MAX_BYTE_SAMPLES / 4;
      sampoff_4 = 3 * MAX_BYTE_SAMPLES / 4;
      samplefunc = &four_ch_sample;
    }
    // attach the interrupts
    Serial.println("debug: starting int/poll sampling...");
    sampling = true;
    if (rising || falling) {
      // The trigger function depends on the "one-shot" mode ISR
      void (*isrptr)(void) = once ? &one_shot_trigger : &clock_trigger;
      cli();
      // Set up the triggers, which will start sampling
      attachInterrupt(0, isrptr, 
        (rising && falling) ? CHANGE :
                    rising  ? RISING : FALLING
      );
      sei();
    } else {
      // or invoke the loop sampler immediately
      sample_loop();
    }
  } else {
    Serial.println("debug: Invalid command: " + c);
  }
}

// There's no error detection in this loop. The code simply
// waits for a string that ends with '%'. There's no max limit
// to the string, so if you erroneously send lots and lots of
// bytes, eventually the Arduino will run out of memory
void wait_for_serial_command(String& command) {
  bool build(true);
  command = "";
  while (build) {
    if (Serial.available()) {
      int in = Serial.read();
      // '%' indicates the end of a command
      if (in == '%') {
        build = false;
      } else {
        command += (char)in;
      }
    }
  }
}

void setup(void) {
  // Pin 8 = ch1, Pin 9 = ch2, Pin 10 = Ch3, Pin 11 = Ch4
  DDRB &= B11110000;
  // Pin 13 is output for LED debug, as always!
  DDRB |= B00100000;
  // Pin 2 = interrupt 0
  DDRD &= B11111011;
  Serial.begin(115200);
  // This is an important string, it helps the server understand
  // the machine's state.
  Serial.println("initialized");
}

void loop(void) {
  String(command);
  wait_for_serial_command(command);
  route_command(command);
}



