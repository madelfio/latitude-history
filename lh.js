var clientId = '301314733328-olnt3kt29bqkcnkprh07ikls8kf7a4s0.apps.googleusercontent.com',
    apiKey = 'AIzaSyD2k1wVYzgPrbZRJUfBGoClFW0Z5BD6DC0',
    scopes = 'https://www.googleapis.com/auth/latitude.all.best';

var refresh_interval = 100,
    max_runs = 1060,
    //max_runs = 352,
    start_date = new Date(); //new Date(2012, 8, 30);

var geocode_queue = queue(1, 2000),
    latitude_queue = queue(1, 100);

//start_date = new Date(2012, 1, 3);
window.onblur = function() {render();}

var colorMap = d3.scale.ordinal()
    .range(['#2ca02c', '#ffbb78', '#ff9896', '#c5b0d5', '#e377c2',
      '#f7b6d2', '#7f7f7f', '#c7c7c7 ', '#bcbd22', '#cbcb8d', '#17be6f',
      '#9edae5', '#393b79', '#5254a3', '#6b6ecf', '#9c9ede', '#637939',
      '#8ca252', '#b5cf6b', '#cedb9c', '#8c6d31', '#bd9e39', '#e7ba52',
      '#e7cb94', '#843c39', '#ad494a', '#d6616b', '#e7969c', '#7b4173',
      '#a55194', '#ce6dbd', '#de9ed6', '#3182bd', '#6baed6', '#9ecae1',
      '#c6dbef', '#e6550d', '#fd8d3c', '#fdae6b', '#fdd0a2', '#31a354',
      '#74c476', '#a1d99b', '#c7e9c0', '#756bb1', '#9e9ac8', '#bcbddc',
      '#dadaeb', '#636363', '#969696', '#bdbdbd', '#d9d9d9', 'darkblue',
      'darkgreen', 'crimson', 'darkmagenta', 'darkorange', 'darkorchid',
      'darkturquoise', 'darkviolet']);

function color(place) {
  switch (place) {
    case 'Unknown':
      return '#eee';
    case 'Washington, DC, USA':
      return '#98df8a';
    case 'Richmond, VA, USA':
      return '#aec7e8';
    case 'Chevy Chase, MD, USA':
      return '#ff7f0e';
    case 'Oakton, VA, USA':
      return '#1fb7b4';
    case 'Chevy Chase Village, MD, USA':
      return 'gold';
    case 'Howard, MD, USA':
      return '#9467bd';
    case 'Vienna, VA, USA':
      return '#8c564b';
    case 'Corolla, NC, USA':
      return '#c49c94';
    case 'College Park, MD, USA':
      return 'lemonchiffon';
    default:
      return colorMap(place);
  }
};

function handleClientLoad() {
  gapi.client.setApiKey(apiKey);
  window.setTimeout(checkAuth, 1);
}

function checkAuth() {
  gapi.auth.authorize(
    {client_id: clientId, scope: scopes, immediate: true},
    handleAuthResult
  );
}

function handleAuthResult(authResult) {
  var authorizeButton = document.getElementById('authorize-button');
  if (authResult && !authResult.error) {
    authorizeButton.style.visibility = 'hidden';
    loadNext();
  } else {
    authorizeButton.style.visibility = '';
    authorizeButton.onclick = handleAuthClick;
  }
}

function handleAuthClick(event) {
  gapi.auth.authorize(
    {client_id: clientId, scope: scopes, immediate: false},
    handleAuthResult
  );
  return false;
}

var latitude_api_loaded = false;
function makeApiCall(date_range, callback) {
  if (!latitude_api_loaded) {
    gapi.client.load('latitude', 'v1', function() {
      latitude_api_loaded = true;
      makeApiCall(date_range, callback);
    });
  } else {
    var request = gapi.client.latitude.location.list({
      'granularity': 'best',
      'max-results':'1000',
      'min-time': +date_range.min_date,
      'max-time': +date_range.max_date
    });
    request.execute(callback);
  };
}

// return specified time-of-day on the calendar day of the ts
function getTimeOfDay(ts, hrs) {
  return d3.time.hour.offset(d3.time.day(ts), hrs);
}

var all_data = [];
var timeout;
function loadNext() {
  var last_date,
      next_date,
      date_range;
  if (all_data.length >= max_runs) {return;}
  if (all_data.length === 0) {
    next_date = start_date;
  } else {
    last_date = d3.min(all_data, function(d) {return d.date;});
    next_date = d3.time.day.offset(last_date, -1);
  }
  //next_date = getTimeOfDay(next_date, +4);
  next_date = getTimeOfDay(next_date, 15);

  // date_range goes from 1am to 8am of the date in question
  date_range = {
    min_date: d3.time.hour.offset(next_date, -3),
    max_date: d3.time.hour.offset(next_date, +4)
  };

  makeApiCall(date_range, function(resp) {
    handleNewData(resp, next_date);
    timeout = setTimeout(loadNext, refresh_interval)
  });
}

function handleNewData(resp, target_date) {
  if (!('items' in resp) || resp.items.length === 0) {
    all_data.push({date: target_date});
    return;
  }
  var raw_result = d3.first(resp.items, function(a, b) {
        var ad = Math.abs(+a.timestampMs-(+target_date)),
            bd = Math.abs(+b.timestampMs-(+target_date));
        return ad < bd ? -1 : ad > bd ? 1 : 0;
      }),
      result = {
        date: target_date,
        lat: raw_result.latitude,
        lng: raw_result.longitude
      };
  result.date = target_date;
  all_data.push(result);
  render();
}

//
// Reverse Geocoding
//

var google_geocode_url = 'https://maps.googleapis.com/maps/api/geocode/json',
    city_lookup = {},
    city_lookup_full = {};

var geocoder = new google.maps.Geocoder();

function get_city_name(lat, lng) {
  var loc_str = lat.toFixed(3).toString() + ',' + lng.toFixed(3),
      done;

  if (!(loc_str in city_lookup)) {
    city_lookup[loc_str] = {
      place_name: loc_str,
      done: false,
      queued: true
    };
    //console.log('queuing ' + lat + ', ' + lng);
    geocode_queue.defer(askGoogle, lat, lng);
  } else if (!(city_lookup[loc_str].done) && !(city_lookup[loc_str].queued)) {
    city_lookup[loc_str].queued = true;
    //console.log('requeuing ' + lat + ', ' + lng);
    geocode_queue.defer(askGoogle, lat, lng);
  }

  return city_lookup[loc_str].place_name;
}

function askGoogle(lat, lng, callback) {
  var loc_str = lat.toFixed(3).toString() + ',' + lng.toFixed(3);
  if (loc_str in city_lookup && city_lookup[loc_str].done) {
    return;
  }
  if (geocoder) {
    var latlng = new google.maps.LatLng(lat, lng);
    //console.log('asking Google about ' + lat + ', ' + lng);
    geocoder.geocode({latLng: latlng}, function(results, status) {
      if (status == google.maps.GeocoderStatus.OK) {
        for (var i=0; i < results.length; i++) {
          if (/^[^,]*, \w*,[^,]*$/.test(results[i].formatted_address)) {
            city_lookup[loc_str].place_name = results[i].formatted_address;
            city_lookup[loc_str].done = true;
            render();
            break;
          }
        }
      } else {
        console.log('Response: ' + status);
        city_lookup[loc_str].error = status;
        if (status === google.maps.GeocoderStatus.OVER_QUERY_LIMIT) {
          setTimeout(function() {get_city_name(lat, lng);}, 10000);
        }
      }
      city_lookup[loc_str].queued = false;
      callback();
    });
  }
}

//
// Display Visualization
//


function render() {
  var data = all_data;
  data.forEach(function(d) {
    if ('lat' in d && 'lng' in d) {
      d.place_name = get_city_name(d.lat, d.lng);
    } else {
      d.place_name = 'Unknown';
    }
  });

  renderCalendar(d3.select('#calendar'), data);
  renderLegend(d3.select('#legend'), data);
  renderList(d3.select('#listing'), data);
}

var day = d3.time.format('%w'),
    week = d3.time.format('%U'),
    year = d3.time.format('%Y'),
    format = d3.time.format('%Y-%m-%d');
var width = 960,
    height = 136,
    cellSize = 15;

function renderCalendar(div, data) {

  var year_range = d3.extent(data, function(d) {return +year(d.date);});

  var svg = div.selectAll('svg')
      .data(d3.range(year_range[0],year_range[1] + 1), function(d) {return d;})
    .enter().insert('svg', ':first-child')
      .attr('width', width)
      .attr('height', height)
      .attr('class', 'year')
    .append('g')
      .attr('transform', 'translate(' + ((width - cellSize * 53) / 2) + ',' + (height - cellSize * 7 - 1) + ')');

  svg.append('text')
    .attr('transform', 'translate(-6,' + cellSize * 3.5 + ')rotate(-90)')
    .style('text-anchor', 'middle')
    .text(function(d) {return d;});

  var rect = svg.selectAll('.day')
      .data(function(d) { return d3.time.days(new Date(d, 0, 1), new Date(d + 1, 0, 1)); })
    .enter().append('rect')
      .attr('class', 'day')
      .attr('width', cellSize)
      .attr('height', cellSize)
      .attr('x', function(d) {return week(d) * cellSize; })
      .attr('y', function(d) {return day(d) * cellSize; })
      .attr('fill', 'white')
      .datum(format);

  rect.append('title')
      .text(function(d) {return d;});

  svg.selectAll('.month')
      .data(function(d) {return d3.time.months(new Date(d, 0, 1), new Date(d + 1, 0, 1)); })
    .enter().append('path')
      .attr('class', 'month')
      .attr('d', monthPath);

  var data_lookup = d3.nest()
    .key(function(d) {return format(d.date);})
    .rollup(function(d) {return d[0];})
    .map(data);

  d3.selectAll('.day')
      .filter(function(d) {return d in data_lookup;})
      .attr('fill', function(d) {return color(data_lookup[d].place_name);})
    .select('title')
      .text(function(d) {return d + ' - ' + data_lookup[d].place_name;});

}

function monthPath(t0) {
  var t1 = new Date(t0.getFullYear(), t0.getMonth() + 1, 0),
      d0 = +day(t0), w0 = +week(t0),
      d1 = +day(t1), w1 = +week(t1);
  return "M" + (w0 + 1) * cellSize + "," + d0 * cellSize
    + "H" + w0 * cellSize + "V" + 7 * cellSize
    + "H" + w1 * cellSize + "V" + (d1 + 1) * cellSize
    + "H" + (w1 + 1) * cellSize + "V" + 0
    + "H" + (w0 + 1) * cellSize + "Z";
}


function renderLegend(div, data) {
  var margin = 5,
      data_lookup = d3.nest()
      .key(function(d) {return d.place_name;})
      .rollup(function(d) {return d.length;})
      .map(data),
      sorted_data = d3.entries(data_lookup).sort(function(a,b) {
        return (b.value < a.value ? -1 : b.value > a.value ? 1 :
                b.key < a.key ? 1 : b.key > a.key ? -1 : 0);
      }),
      x = d3.scale.linear().range([margin, margin+20]);

  div.transition().style('height', (x(sorted_data.length) + margin) + 'px');

  var entries = div.selectAll('div.legend')
      .data(sorted_data, function(d) {return d.key;});

  var entering = entries.enter()
    .append('div')
      .classed('legend', true)
      .style('color', '#fff')
      .style('top', function(d, i) {return x(i) + 'px';});

  entering.append('span')
    .classed('legend-rank', true)
    .classed('legend-info', true);

  entering.append('span')
    .classed('legend-label', true)
    .classed('legend-info', true)
    .text(function(d) {return d.key;});

  entering.append('span')
    .classed('legend-count', true)
    .classed('legend-info', true)
    .text(function(d) {return d.value;});

  entering.append('span')
      .classed('legend-color', true)
      .classed('legend-info', true)
      .style('background-color', function(d, i) {return color(d.key);})
      .html('&nbsp;');

  entries
    .transition()
    .style('top', function(d, i) {return x(i) + 'px';})
    .style('color', '#333');

  entries.select('span.legend-count')
    .text(function(d) {return d.value;});

  entries.select('span.legend-rank')
    .text(function(d, i) {return i + 1;});

  entries.exit().remove();
}

function renderList(div, data) {
  var dates = div.selectAll('div').data(data, function(d) {return +d.date;});

  dates.enter() .append('div');
  dates.text(function(d) {return d.date + ' - ' + d.place_name;});
  dates.exit().remove();
}
