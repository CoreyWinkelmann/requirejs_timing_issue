/*
* jQuery Plugin: Tokenizing Autocomplete Text Entry
* Version 1.1
*
* Copyright (c) 2009 James Smith (http://loopj.com)
* Licensed jointly under the GPL and MIT licenses,
* choose which one suits your project best!
*
*/

define( 
	['jquery'],
	function() {
		(function($) {
			$.fn.tokenInput = function (url, options) {
				var settings = $.extend({
					url: url,
					hintText: "Type in a search term",
					noResultsText: "No results",
					searchingText: "Searching...",
					searchDelay: 300,
					minChars: 1,
					tokenLimit: null,
					jsonContainer: null,
					method: "GET",
					contentType: "json",
					queryParam: "q",
					prePopulate: null,
					onResult: null,
					onSelect : null,
					onDelete : null,
					// This will allow you to customize the display items
					// If you need more information then a single name
					displayContent : null,
					afterDisplay : null,
					afterHide : null,
					beforeSearch : null,
					useCache : true,
					alwaysOnTop : false
				}, options);

				settings.classes = $.extend({
					tokenList: "token-input-list",
					token: "token-input-token",
					tokenDelete: "token-input-delete-token",
					selectedToken: "token-input-selected-token",
					highlightedToken: "token-input-highlighted-token",
					dropdown: "token-input-dropdown",
					dropdownItem: "token-input-dropdown-item",
					dropdownItem2: "token-input-dropdown-item2",
					selectedDropdownItem: "token-input-selected-dropdown-item",
					inputToken: "token-input-input-token"
				}, options.classes);

				return this.each(function () {
					var list = new $.TokenList(this, settings);
				});
			};

			$.TokenList = function (input, settings) {
				//
				// Variables
				//

				// Input box position "enum"
				var POSITION = {
					BEFORE: 0,
					AFTER: 1,
					END: 2
				};

				// Keys "enum"
				var KEY = {
					BACKSPACE: 8,
					TAB: 9,
					RETURN: 13,
					ESC: 27,
					LEFT: 37,
					UP: 38,
					RIGHT: 39,
					DOWN: 40,
					COMMA: 188
				};

				// Save the tokens
				var saved_tokens = [];

				// Keep track of the number of tokens in the list
				var token_count = 0;

				// Basic cache to save on db hits
				var cache = new $.TokenList.Cache();

				// Keep track of the timeout
				var timeout;

				// Create a new text input and attach keyup events
				var input_box = $("<input type=\"text\" />")
					.css({ outline: "none" })
					.focus(function () {
						if ($(this).val()) { 
							setTimeout(function() { do_search(false); }, 5);
						}
						else if (settings.tokenLimit === null || settings.tokenLimit != token_count) {
							show_dropdown_hint();
						}
					})
					.blur(function () {
						setTimeout(function(){hide_dropdown();}, 1300);
					})
					.keydown(function (event) {
						var previous_token;
						var next_token;

						switch(event.keyCode) {
							case KEY.UP:
							case KEY.DOWN:
								if (!$(this).val()) {
									previous_token = input_token.prev();
									next_token = input_token.next();

									if ((previous_token.length && previous_token.get(0) === selected_token) || (next_token.length && next_token.get(0) === selected_token)) {
										// Check if there is a previous/next token and it is selected
										if (event.keyCode == KEY.LEFT || event.keyCode == KEY.UP) {
											deselect_token($(selected_token), POSITION.BEFORE);
										}
										else {
											deselect_token($(selected_token), POSITION.AFTER);
										}
									}
									else if ((event.keyCode == KEY.LEFT || event.keyCode == KEY.UP) && previous_token.length) {
										// We are moving left, select the previous token if it exists
										select_token($(previous_token.get(0)));
									}
									else if ((event.keyCode == KEY.RIGHT || event.keyCode == KEY.DOWN) && next_token.length) {
										// We are moving right, select the next token if it exists
										select_token($(next_token.get(0)));
									}
								}
								else {
									var dropdown_item = null;

									if (event.keyCode == KEY.DOWN || event.keyCode == KEY.RIGHT) {
										dropdown_item = $(selected_dropdown_item).next();
									} else {
										dropdown_item = $(selected_dropdown_item).prev();
									}

									if (dropdown_item.length) {
										select_dropdown_item(dropdown_item);
									}
									return false;
								}
								break;

							case KEY.LEFT:
							case KEY.RIGHT:
								break;
							case KEY.BACKSPACE:
								previous_token = input_token.prev();

								if (!$(this).val().length) {
									if (selected_token) {
										delete_token($(selected_token));
									}
									else if (previous_token.length) {
										select_token($(previous_token.get(0)));
									}

									return false;
								}
								else if ($(this).val().length == 1) {
									hide_dropdown();
								}
								else {
									// set a timeout just long enough to let this function finish.
									setTimeout(function(){do_search(false);}, 5);
								}
								break;

							case KEY.TAB:
							case KEY.RETURN:
							case KEY.COMMA:
								if (selected_dropdown_item) {
									add_token($(selected_dropdown_item));
									if ($.isFunction(settings.onSelect)) {
										settings.onSelect.call(this, hidden_input);
									}
									return false;
								}
								break;

							case KEY.ESC:
								hide_dropdown();
								return true;

							default:
								if (is_printable_character(event.keyCode)) {
									// set a timeout just long enough to let this function finish.
									setTimeout(function() { do_search(false); }, 5);
								}
								break;
						}
					});

				// Keep a reference to the original input box
				var hidden_input = $(input)
					.hide()
					.focus(function () {
						setTimeout(function(){input_box.focus();}, 5);
					})
					.blur(function () {
						setTimeout(function(){input_box.blur();}, 5);
					});

				// Keep a reference to the selected token and dropdown item
				var selected_token = null;
				var selected_dropdown_item = null;

				// The list to store the token items in
				var token_list = $("<ul />")
					.addClass(settings.classes.tokenList)
					.insertAfter(hidden_input)
					.click(function (event) {
						var li = get_element_from_event(event, "li");
						if (li && li.get(0) != input_token.get(0)) {
						toggle_select_token(li);
						return false;
						}
						else {
							input_box.focus();

								if (selected_token) {
									deselect_token($(selected_token), POSITION.END);
								}
						}
					})
					.mouseover(function (event) {
						var li = get_element_from_event(event, "li");
						if (li && selected_token !== this) {
						li.addClass(settings.classes.highlightedToken);
						}
					})
					.mouseout(function (event) {
						var li = get_element_from_event(event, "li");
						if (li && selected_token !== this) {
						li.removeClass(settings.classes.highlightedToken);
						}
					})
					.mousedown(function (event) {
						// Stop user selecting text on tokens
						var input = $(get_element_from_event(event, "li")).find('input');
						if (input.length === 0){
						return false;
						}
					});

				// The list to store the dropdown items in
				var dropdown = $("<div>")
					.addClass(settings.classes.dropdown)
					.hide();

				if (settings.alwaysOnTop){
					dropdown.appendTo("body");
				}
				else {
					dropdown.insertAfter(token_list);
				}

				// The token holding the input box
				var input_token = $("<li />")
					.addClass(settings.classes.inputToken)
					.appendTo(token_list)
					.append(input_box);

				init_list();

				//
				// Functions
				//


				// Pre-populate list if items exist
				function init_list () {
					var li_data = settings.prePopulate;
					deleteTokenClick = function(token) {
						delete_token(token);
						return false;
					};
					// Clear input box and make sure it keeps focus
					input_box.val("").focus();

					if (li_data && li_data.length) {
						for (var i in li_data) {
							if (li_data.hasOwnProperty(i)) {
								var this_token = $("<li><p>"+li_data[i].name+"</p></li>")
									.addClass(settings.classes.token)
									.insertBefore(input_token);

								$("<span>x</span>")
									.addClass(settings.classes.tokenDelete)
									.appendTo(this_token)
									.click(function() {
										deleteTokenClick($(this).parent());
									});

								// Save this token id
								var id_string = li_data[i].id + ",";
								hidden_input.val(hidden_input.val() + id_string);

								$.data(this_token.get(0), "tokeninput", {"id": li_data[i].id, "name": li_data[i].name});

								if (settings.tokenLimit !== null && settings.tokenLimit >= token_count) {
									input_box.hide();
								}
								setTimeout(hide_dropdown, 50);

								if ($.isFunction(settings.onSelect)) {
									settings.onSelect.call(this, hidden_input);
								}
							}
						}
					}
				}

				function is_printable_character(keycode) {
					if (
						(keycode >= 48 && keycode <= 90) ||	  // 0-1a-z
						(keycode >= 96 && keycode <= 111) ||  // numpad 0-9 + - / * .
						(keycode >= 186 && keycode <= 192) || // ; = , - . / ^
						(keycode >= 219 && keycode <= 222)	  // ( \ ) '
					) {
						return true;
					}
					else {
						return false;
					}
				}

				// Get an element of a particular type from an event (click/mouseover etc)
				function get_element_from_event (event, element_type) {
					var target = $(event.target);
					var element = null;

					if (target.is(element_type)) {
					element = target;
					} else if (target.parents(element_type).length) {
					element = target.parents(element_type+":first");
					}

					return element;
				}

				// Inner function to a token to the list
				function insert_token(id, value) {
					var this_token = $("<li><p>"+ value +"</p> </li>")
					.addClass(settings.classes.token)
					.insertBefore(input_token);

					// The 'delete token' button
					$("<span>x</span>")
					.addClass(settings.classes.tokenDelete)
					.appendTo(this_token)
					.click(function () {
					delete_token($(this).parent());
					return false;
					});

					$.data(this_token.get(0), "tokeninput", {"id": id, "name": value});

					return this_token;
				}

				function is_unique (li_data) {
					var isUnique = true;
					if ( li_data > 0 ) {
					var idString = hidden_input.val();
					var idArray = idString.split(',');

					for ( var i = 0; i < idArray.length; i++ ) {
						if ( li_data.id == idArray[i] ) {
						isUnique = false;
						break;
						}
					}
					}

					return is_unique;
				}

				// Add a token to the token list based on user input
				function add_token (item) {
					var li_data = $.data(item.get(0), "tokeninput");
					// validate unique entry
					if ( is_unique(li_data) ) {
						var this_token = insert_token(li_data.id, li_data.name);
						// Save this token id
						var id_string = li_data.id + ",";
						hidden_input.val(hidden_input.val() + id_string);

						token_count++;

						if (settings.tokenLimit !== null && settings.tokenLimit >= token_count) {
							input_box.hide();
							hide_dropdown();
						}
					}

					// Clear input box and make sure it keeps focus
					input_box.val("").focus();

					// Don't show the help dropdown, they've got the idea
					hide_dropdown();
				}

				// Select a token in the token list
				function select_token (token) {
					token.addClass(settings.classes.selectedToken);
					selected_token = token.get(0);

					// Hide input box
					input_box.val("");

					// Hide dropdown if it is visible (eg if we clicked to select token)
					hide_dropdown();
				}

				// Deselect a token in the token list
				function deselect_token (token, position) {
					token.removeClass(settings.classes.selectedToken);
					selected_token = null;

					if (position == POSITION.BEFORE) {
						input_token.insertBefore(token);
					}
					else if (position == POSITION.AFTER) {
						input_token.insertAfter(token);
					}
					else {
						input_token.appendTo(token_list);
					}

					// Show the input box and give it focus again
					input_box.focus();
				}

				// Toggle selection of a token in the token list
				function toggle_select_token (token) {
					if (selected_token == token.get(0)) {
						deselect_token(token, POSITION.END);
					}
					else {
						if (selected_token) {
							deselect_token($(selected_token), POSITION.END);
						}
						select_token(token);
					}
				}

				// Delete a token from the token list
				function delete_token (token) {
					// Remove the id from the saved list
					var token_data = $.data(token.get(0), "tokeninput");

					// Delete the token
					token.remove();
					selected_token = null;

					// Show the input box and give it focus again
					input_box.focus();

					// Delete this token's id from hidden input
					var str = hidden_input.val();
					var start = str.indexOf(token_data.id+",");
					var end = str.indexOf(",", start) + 1;

					if (end >= str.length) {
						hidden_input.val(str.slice(0, start));
					}
					else {
						hidden_input.val(str.slice(0, start) + str.slice(end, str.length));
					}

					token_count--;

					if (settings.tokenLimit !== null) {
						input_box.show().val("").focus();
					}

					if ($.isFunction(settings.onDelete)) {
						settings.onDelete.call(this, hidden_input);
					}

				}

				// Hide and clear the results dropdown
				function hide_dropdown () {
					dropdown.hide().empty();
					selected_dropdown_item = null;
					if ($.isFunction(settings.afterHide)) {
						settings.afterHide.call(this);
					}
				}

				function show_dropdown_searching () {
					dropdown.html("<p>"+settings.searchingText+"</p>");
					if (settings.alwaysOnTop) {
						var offset = getOffset(token_list);
						dropdown.css({"position":"absolute", "top":offset.top, "left":offset.left});
					}
					dropdown.show();
				}

				function getOffset(element) {
					var offset = element.offset();
					var height = element.height();
					var calculatedOffset = {};
					calculatedOffset.top = offset.top + height + 4;
					calculatedOffset.left = offset.left;

					return calculatedOffset;
				}

				function show_dropdown_hint () {
					dropdown.html("<p>"+settings.hintText+"</p>");
					if (settings.alwaysOnTop) {
						var offset = getOffset(token_list);
						dropdown.css({"position":"absolute", "top":offset.top, "left":offset.left});
					}
					dropdown.show();
				}

				// Highlight the query part of the search term
				function highlight_term(value, term) {
					return value.replace(new RegExp("(?![^&;]+;)(?!<[^<>]*)(" + term + ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<b>$1</b>");
				}

				// Populate the results dropdown with some results
				function populate_dropdown (query, results) {
					var offset = null;
					if (results.length) {
						dropdown.empty();
						var dropdown_ul = $("<ul>")
							.appendTo(dropdown)
							.mouseover(function (event) {
								select_dropdown_item(get_element_from_event(event, "li"));
							})
							.click(function (event) {
								add_token(get_element_from_event(event, "li"));
								if ($.isFunction(settings.onSelect)) {
									settings.onSelect.call(this, hidden_input);
								}
							})
							.mousedown(function (event) {
								// Stop user selecting text on tokens
								return false;
							})
							.hide();

					// This will create a customized li element to display the content
					var html_content = '';
					for (var i in results) {
						if (results.hasOwnProperty(i)) {
							if ($.isFunction(settings.displayContent)) {
								html_content = settings.displayContent.call(this, results[i]);
							}
							else {
								html_content = highlight_term(results[i].name, query);
							}

							var this_li = $("<li class=\"clearfix\"></li>")
							.html(html_content)
							.appendTo(dropdown_ul);

							if (i%2) {
								this_li.addClass(settings.classes.dropdownItem);
							}
							else {
								this_li.addClass(settings.classes.dropdownItem2);
							}

							if (i == 0) {
								select_dropdown_item(this_li);
							}

							$.data(this_li.get(0), "tokeninput", {"id": results[i].id, "name": results[i].name});
						}
					}

					if (settings.alwaysOnTop) {
						offset = getOffset(token_list);
						dropdown.css({"position":"absolute", "top":offset.top, "left":offset.left});
					}
					dropdown.show();
					dropdown_ul.slideDown("fast");

					}
					else {
						dropdown.html("<p>"+settings.noResultsText+"</p>");
						if (settings.alwaysOnTop) {
							offset = getOffset(token_list);
							dropdown.css({"position":"absolute", "top":offset.top, "left":offset.left});
						}
						dropdown.show();
					}
				}

				// Highlight an item in the results dropdown
				function select_dropdown_item (item) {
					if (item) {
						if (selected_dropdown_item) {
							deselect_dropdown_item($(selected_dropdown_item));
						}

						item.addClass(settings.classes.selectedDropdownItem);
						selected_dropdown_item = item.get(0);
					}
				}

				// Remove highlighting from an item in the results dropdown
				function deselect_dropdown_item (item) {
					item.removeClass(settings.classes.selectedDropdownItem);
					selected_dropdown_item = null;
				}

				// Do a search and show the "searching" dropdown if the input is longer
				// than settings.minChars
				function do_search(immediate) {
					var query = input_box.val().toLowerCase();

					if (query && query.length) {
						if (selected_token) {
							deselect_token($(selected_token), POSITION.AFTER);
						}
						if (query.length >= settings.minChars) {
							if ($.isFunction(settings.beforeSearch)){
								settings.beforeSearch.call(this, hidden_input);
							}
							show_dropdown_searching();
							if (immediate) {
								run_search(query);
							}
							else {
								clearTimeout(timeout);
								timeout = setTimeout(function(){run_search(query);}, settings.searchDelay);
							}
						}
						else {
							hide_dropdown();
						}
					}
				}

				// Do the actual search
				function run_search(query) {
					var cached_results = cache.get(query);
					if (cached_results && settings.useCache) {
						populate_dropdown(query, cached_results);
						if ($.isFunction(settings.afterDisplay)) {
							settings.afterDisplay.call(this);
						}
					}
					else {
						var queryStringDelimiter = settings.url.indexOf("?") < 0 ? "?" : "&";
						var callback = function(results) {
							if ($.isFunction(settings.onResult)) {
								results = settings.onResult.call(this, results, hidden_input);
							}
							cache.add(query, settings.jsonContainer ? results[settings.jsonContainer] : results);
							populate_dropdown(query, settings.jsonContainer ? results[settings.jsonContainer] : results);
							if ($.isFunction(settings.afterDisplay)) {
								settings.afterDisplay.call(this);
							}
						};

						// encode the search parameter to deal with ampersands and other characters
						query = encodeURIComponent(query);
						
						if (settings.method == "POST") {
							$.post(settings.url + queryStringDelimiter + settings.queryParam + "=" + query, {}, callback, settings.contentType);
						}
						else {
							$.get(settings.url + queryStringDelimiter + settings.queryParam + "=" + query, {}, callback, settings.contentType);
						}
					}
				}
			};

			// Really basic cache for the results
			$.TokenList.Cache = function (options) {
				var settings = $.extend({
					max_size: 50
				}, options);

				var data = {};
				var size = 0;

				var flush = function () {
					data = {};
					size = 0;
				};

				this.add = function (query, results) {
					if (size > settings.max_size) {
						flush();
					}

					if (!data[query]) {
						size++;
					}

					data[query] = results;
				};

				this.get = function (query) {
					return data[query];
				};
			};

		})(jQuery);
	}
);
