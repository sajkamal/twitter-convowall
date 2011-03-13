
String.prototype.urls = function () {
    return this.match(/http:\/\/[A-Za-z0-9-_]+\.[A-Za-z0-9-_:%&\?\/.=]+/g);
};


Convowall = (function($) {

   
    // Would be nice if AJAX could use .. when run using file:// urls

    var scripts = document.getElementsByTagName("script"),
    src = scripts[scripts.length-1].src;
    base = src.substring(0,src.lastIndexOf('/'));

    Convowall = {
        o: {
            search: {
                q:'#twitter or twitter',
                lang: 'en',
                refresh_url: null,
                since_id: -1
            },
            limit: 10,
            theme: 'keynote',
            theme_path: base + '/../themes',
            interval: 5000,
            embedly: {
                maxWidth: 250,
                maxHeight: 250
            },
            reset: null
        },

        // The current Javascript timeout
        timeout: null,

        // The jQuery element containing the Convowall
        elem: null,

        init: function(s,elem) {
            var that = this;
            that.o = $.extend(that.o,s);
            that.elem = elem;

            $.when(
                $.getScript(base+'/lib/jquery.dump.js'),
                $.getScript(base+'/lib/view.js'),
                $.getScript(base+'/lib/jquery.embedly.min.js'),
                $.getScript(base+'/lib/ejs.js')).then(function() {
                that.loadTheme(that.o.theme);
            }).done(function() {
                that.start();
                if (that.o.reset) {
                    setTimeout(function() {
                        window.location.reload();
                    }, that.o.reset*60*1000);
                }
            })
        },

        option: function(k,v) {
            if (typeof k === 'object') {
                this.o = $.extend(this.o,k);
                return this.o;
            } else if (typeof v !== 'undefined') {
                this.o[k] = v;
            }
            return this.o[k];
        },

        start: function() {
            if(this.timeout) clearTimeout(this.timeout);
            this.o.search.rpp = this.o.limit;
            this.update();
        },

        loadTheme: function(theme) {
            var that = this;
            $.when(
                this.loadThemeJS(theme),
                this.loadThemeCSS(theme)
                ).then(function() {
                var url = that.o.theme_path+'/'+that.o.theme+'/page.html.ejs';
                var page = new EJS({
                    url: url
                }).render(this.o);
                $('body').append($(page));
            });
        },

        loadThemeJS: function(theme) {
            var url = this.o.theme_path+'/'+theme+'/init.js';
            return $.getScript(url);
        },

        loadThemeCSS: function(theme) {
            var that = this;
            var url = this.o.theme_path+'/'+theme+'/theme.css';
            return $.ajax({
                url: url,
                dataType: 'html'
            }).done(function(css,textStatus,xhr) {
                $('<style type="text/css"></style>')
                .html(css)
                .appendTo("head");
            }).fail(function(xhr,textStatus,errorThrown) {
                alert('The url '+ url+' for theme \''+theme+'\' failed to load. Please check that the theme folder exists within '+that.o.theme_path+'.\n\nThe error thrown was:\n '+errorThrown);
            });
        },


        hideEntries: function() {
            $(this.elem).find('.entry:gt('+ (this.o.limit-2) + ')').each(function () {
                $(this).fadeOut('slow')
            });

        },

        showEntry: function (data) {
            var template = this.o.theme_path+'/'+this.o.theme+'/entry.html.ejs';
            var ejs = new EJS({
                url: template
            });

            var div = $('<div></div>').addClass('entry').html(ejs.render(data)).hide();
            this.elem.prepend(div);
            div.fadeIn('slow');
        },

        // Returns a deferred object that resolves to an oembed or empty object
        processEmbeds: function(data) {
            var that = this;
            var dfr = $.Deferred();

            // Returns a deferred object that resolves to a lengthened URL
            var longurl = function(url) {
                var dfr = $.Deferred();
                $.ajax({
                    type: 'GET',
                    url:'http://api.longurl.org/v2/expand',
                    data: {
                        format: 'json',
                        url: url
                    },
                    dataType: 'jsonp'
                }).done(function(data) {
                    dfr.resolve(data['long-url']);
                }).fail(function() {
                    dfr.resolve(url);
                });
                return dfr.promise();
            }

            // Returns a deferred object that resolves to an oembed object or empty object
            var sendToEmbedly = function(url) {
                var dfr = $.Deferred();
                if (url.match(window.embedlyURLre)) {
                    $.embedly(url,$.extend(that.o.embedly,{
                        success:  function(oembed) {
                            dfr.resolve(oembed);
                        }
                    }));
                } else {
                    dfr.resolve({});
                }
                return dfr.promise();
            };

            if (data.urls && data.urls.length > 0) {
                var url = data.urls[0];
                if (url.match(/^http:\/\/(t\.co|bit\.ly|j\.mp|is\.gd|tinyurl\.com|twurl\.nl)/)) {
                    longurl(url).done(function(url) {
                        sendToEmbedly(url).then(function(oembed) {
                            dfr.resolve(oembed);
                        });
                    });
                    return dfr.promise();
                } else {
                    return sendToEmbedly(url);
                }
            }
            dfr.resolve({});
            return dfr.promise();
        },

        update: function() {
            var that = this;
        
            this.search(this.o.search, function(json) {
                if (!json || !json.results || json.results.length == 0) return;
                that.o.search.rpp = 1;
                that.hideEntries();
                that.o.search.since_id = json.results[0].id_str;
                $(json.results).each(function(i,result) {
                    // Add extra fields for use by the view
                    var data = $.extend(result,{
                        date: new Date(Date.parse(result.created_at)),
                        urls: result.text.urls(),
                        text_only: result.text.replace(/http:\/\/[A-Za-z0-9-_]+\.[A-Za-z0-9-_:%&\?\/.=]+/g,''),
                        oembed: {}
                    });
                  
                   
                    that.o.embedly ? that.processEmbeds(data).then(function(oembed) {
                        data.oembed = oembed;
                        that.showEntry(data);
                    }) : that.showEntry(data);
                   
                });

            });

            timeout = setTimeout(function () {
                that.update();
            }, this.o.interval);
           
        },

        search: function(o,success) {
            var s = $.extend({
                q:'',
                lang:'en',
                rpp:10,
                since_id:-1,
                refresh_url:null
            },o);
          
            var url = "http://search.twitter.com/search.json";
         
            if (s.refresh_url) {
                url += s.refresh_url + '&lang=' + s.lang + '&rpp=' + s.rpp + '&callback=?';
            } else {
                url += "?result_type=recent&q=" + encodeURIComponent(s.q) + "&lang=" + s.lang + "&rpp=" + s.rpp + "&since_id=" + s.since_id + "&callback=?";
            }
         
            $.getJSON(url, function(json) {
                if (json && json.results) success(json);
            });

        }
    };

    $.fn.convowall = function(o) {
        Convowall.init(o,this);
    };

    return Convowall;

})(jQuery);