"using strict";

class FVSignupLogic {
  static current_page = null;
  static page_status = {};
  static listeners = {};

  static add_listener(name, callback) {
    if (this.listeners[name] == undefined) {
      this.listeners[name] = [];
    }
    this.listeners[name].push(callback);
  }

  static fire(name) {
    if (this.listeners[name] == undefined) return;
    for(const callback of this.listeners[name]) {
      callback();
    }
  }

  static require_config(callback) {
    if (FVSignup.config && FVSignup.config.loaded == true) {
      callback();
    } else {
      this.add_listener('config_ready', callback);
    }
  }

  static page_list(pages) {
    for(const key in pages) {
      this.page_status[key] = 'known';
    }
  }

  static is_page_disabled(key) {
    return this.page_status[key] == 'disabled';
  }

  static nav_click(key) {
    if (this.is_page_disabled(key)) return;

    // Check for errors before navigating
    let current = this.current_page;
    let errors = this.check_page(current);
    if (errors.length != 0) {
      let text = {
        en: "There some issues with the input on the current page.\nDo you still want to continue?",
        da: "Der er nogle problemer med indtastningen på den nuværende side.\nVil du fortsætte alligevel?",
      }
      if (!confirm(text[FVSignup.get_lang()])) {
        return;
      }
    }

    // Move selection
    FVSignup.main_content.find('nav div.selected').removeClass('selected');
    FVSignup.main_content.find('nav div[page-id="'+key+'"]').addClass('selected');

    // Hide all pages
    FVSignup.page_wrapper.find('div.signup-page').hide();
    
    // Show current page
    FVSignup.page_wrapper.find('div#'+key).show();
    this.current_page = key;
    
    // Scroll to top
    window.scrollTo(0, 0);
    window.dispatchEvent(new CustomEvent('scroll')) // Reset top menu
    
    // Set addressbar
    window.history.pushState({page:key},"", FVSignup.get_base_url()+key+"/");

    // Fire listeners
    this.fire('page_'+key);
  }

  static next() { this.navigate('next'); }
  static prev() { this.navigate('prev'); }

  static navigate(direction) {
    let navto = FVSignup.main_content.find('nav div.selected');
    
    do {
      if (direction == 'prev') {
        navto = navto.prev();
      } else {
        navto = navto.next();
      }
    } while (navto.hasClass('disabled'))
    
    if (navto.length == 0) return;
    this.nav_click(navto.attr('page-id'));
  }

  static refresh_page() {
    this.fire('page_'+this.current_page);
  }

  static page_ready(key) {
    // Load data from storage for page
    // FVSignupStorage.page_loaded(key);

    let page = FVSignup.get_page(key);

    // Open the first page when it's ready (unless we seleted another already)
    if (this.current_page == null && (key == FVSignup.get_start_page() || ( FVSignup.get_start_page() == null && page.order == 1))) {
      FVSignup.main_content.find('nav div[page-id="'+key+'"]').addClass('selected');
      FVSignup.page_wrapper.find('div#'+key).show();
      this.current_page = key;

      // Fire listeners
      this.fire('page_'+key);
    }

    // Mark page status
    let logic = FVSignup.get_page(key).display_logic;
    if (logic && logic.default == 'disabled') {
      this.page_status[key] = 'disabled';
    } else {
      this.page_status[key] = 'ready';
    }

    // Check if all pages are done
    let waiting = this.missing_pages();
    if (waiting.length == 0) {
      this.all_loaded();
    }
  }

  static missing_pages() {
    return Object.values(this.page_status).filter(function(value) {
      // Return true if page is missing
      return !(value == 'ready' || value == 'disabled');
    })
  }

  static all_loaded() {
    this.init_radio_logic();
    for(const page_id of FVSignup.page_keys) {
      let page = FVSignup.get_page(page_id);
      this.init_display_logic({ page: page_id}, page);
      
      if (!Array.isArray(page.sections)) continue;
      for (const [index, section] of page.sections.entries()) {
        this.init_display_logic( { page: page_id, section: index}, section);
        for (const item of section.items ?? []) {
          this.init_item_logic(item);
        }
      }
    }
    this.fire('all_loaded');
  }

  static init_radio_logic() {
    jQuery('input[type="radio"]').change(function (evt){
      let radio = jQuery(evt.target);
      let wrapper = radio.closest('.input-wrapper.input-type-radio');
      let hidden = wrapper.find('input#'+radio.attr('name').replaceAll(':', '\\:'));
      hidden.val(radio.val());
      hidden.change();
    });
  }

  static init_display_logic(item_id, item) {
    let logic = item.display_logic;
    if(!logic) return;

    for(const rule of logic) {
      let input = rule.input;
      if (rule.type == "age") {
        input = "birthdate";
      }

      if (!input) continue;

      // Update page status when an input that's part of the rule changes
      FVSignup.get_input(input).change(function() {
        FVSignupLogic.update_display_status(item_id, logic);
      });
    }

    this.update_display_status(item_id, logic);
  }

  static update_display_status(item_id, logic) {

    let status = "normal";
    for(const rule of logic) {
      let input = rule.input ? FVSignup.get_input(rule.input) : undefined;
      let compare_value;

      switch(rule.type) {
        case 'default':
          status = rule.status;
          break;
        
        case 'field_compare':
          compare_value = input.val();           
          break;

        case 'checkbox':
          status = input.prop('checked') ? rule.status : status;
          break;

        case 'age':
          compare_value = FVSignup.get_age();
          break;

        default:
          console.error("Display Logic, Unknown rule type", "Rule:", rule);
      }

      if (rule.compare) {
        switch (rule.compare) {
          case 'equals':
            status = compare_value == rule.value ? rule.status : status;
            break;

          case 'greater': 
            status = compare_value > rule.value ? rule.status : status;
            break;

          case 'less': 
            status = compare_value < rule.value ? rule.status : status;
            break;

          default:
            console.error("Display Logic, Unknown comparisson", "Rule:", rule);
        }
      }
    }

    this.set_display_status(item_id, status);
  }

  static set_display_status(item_id, status) {
    // Check if item is an input
    if(item_id.input) {
      let input = FVSignup.get_input(item_id.input);
      let wrapper = input.closest('.input-wrapper');

      if (status === "hidden") {
        input.hide();
        wrapper.hide();
      } else {
        input.show();
        wrapper.show();
      }
      
      if (status === "disabled") {
        input.attr('disabled', 'true');
        wrapper.addClass('disabled');
      } else {
        input.removeAttr('disabled');
        wrapper.removeClass('disabled');
      }
      return;
    }

    // If item isn't an input, we need a page
    if (!item_id.page) return;
    
    let page_div = FVSignup.page_wrapper.find('#'+item_id.page);
    if(page_div.length !== 1) {
      console.error("Display status, wrong or ambiguous page ID", "ID:", item_id, "Status:", status);
      return;
    }

    // Check if we have a section
    if (item_id.section) {
      let section_div = jQuery(page_div.find('.section-wrapper')[item_id.section]);
  
      status === "hidden" ? section_div.hide() : section_div.show();
  
      let inputs = section_div.find('input');
      if (status === "disabled") {
        section_div.addClass('disabled');
      } else {
        section_div.removeClass('disabled');
      }

      if (status == "normal") {
        inputs.each(function() {
          // only enable inputs that haven't been individually disabled
          let wrapper = jQuery(this).closest('.input-wrapper');
          if (!wrapper.hasClass('disabled')) jQuery(this).removeAttr('disabled');
        })
      } else {
        inputs.attr('disabled', 'true');
      }
      return;
    }

    // There was no section specified, so status relates to whole page
    let nav_button = FVSignup.navigation.find('[page-id="'+item_id.page+'"]');
    if (status == "normal") {
      nav_button.removeClass('disabled');
      page_div.removeClass('disabled');
      this.page_status[item_id.page] = 'ready';
    } else {
      nav_button.addClass('disabled');
      page_div.addClass('disabled');
      this.page_status[item_id.page] = 'disabled';
    }
  }

  /**
   * Logic for excluding other choices
   */
  static init_item_logic(item) {
    this.init_display_logic({input: item.infosys_id}, item);

    if (!item.infosys_id) return;
    let input = FVSignup.get_input(item.infosys_id);
    if (item.excludes) this.init_exclude_item(item, input);
  }

  static init_exclude_item(item, input) {
    if(input.attr('type') == 'checkbox') {
      input.click(function() {
        if (input.prop('checked')) {
          for(const exclude of item.excludes) {
            FVSignup.get_input(exclude).prop('checked', false);
          }
        }
      });
    } else {
      console.error('Unsupported input type for exclude', item);
    }
  }

  // TODO
  // Wear for junior
  // Mobil must be number
  static check_page(page_id) {
    let page = FVSignup.get_page(page_id);
    let errors = [];
    if(!page.sections) return errors;
    for(const section of page.sections) {
      
      // Check for module errors
      if (section.module) {
        let module = FVSignup.get_module(section.module);
        if (module.check_errors) {
          errors = errors.concat(module.check_errors());
        } 
      }

      // Check input errors
      if(!section.items) continue;
      for(const item of section.items) {
        // Conditional required - like Alea for organizers
        let con_req = false;
        if (item.required_if) {
          let input = jQuery("#"+item.required_if.field);
          switch(item.required_if.logic) {
            case 'equals':
              con_req = input.val() == item.required_if.value;
              break;

            default:
            errors.push({
              id: item.infosys_id,
              type: 'unknown_logic',
              logic: item.required_if.logic,
            });
          }
        }
        // Required input
        if (item.required || con_req) {
          let input = FVSignup.get_input(item.infosys_id);
          let status = item.type == 'checkbox' ? input.prop('checked') : input.val();
          if (!status) {
            errors.push({
              id: item.infosys_id,
              type: 'required',
            });
          }
        }
        // Matching input like Email confirm
        if (item.equals) {
          let input = FVSignup.get_input(item.infosys_id);
          let compare = FVSignup.get_input(item.equals);
          if (input.val() != compare.val()) {
            errors.push({
              id: item.infosys_id,
              type: 'match',
            });
          }
        }
        // Exclusive picks like entry partout and entry single days
        if (item.excludes) {
          let input = FVSignup.get_input(item.infosys_id);
          let enabled = false;
          switch (item.type) {
            case 'checkbox':
              enabled = input.prop('checked');
              break;

            default:
              errors.push({
                id: item.infosys_id,
                type: 'exclude_unsupported_type',
                input_type: item.type,
              });
          }
          // Only check for exclusive if input is enabled 
          if(enabled) {
            for(const exclude of item.excludes) {
              let other = FVSignup.get_input(exclude);
              if (other.attr('type') == 'checkbox') {
                if (other.prop('checked')) {
                  errors.push({
                    id: item.infosys_id,
                    type: 'excludes',
                    other: exclude,
                  });
                }
                continue;
              }
              errors.push({
                id: item.infosys_id,
                type: 'exclude_unsupported_other_type',
                other_id: exclude,
                other: other,
              });
            }
          }
        }
      }
    }
    this.mark_errors(page_id, errors);
    return errors;
  }

  static mark_errors(page_id, errors) {
    let nav_button = FVSignup.main_content.find('nav div[page-id="'+page_id+'"]');
    let page_div = FVSignup.get_page_div(page_id);

    // Remove existing error markings
    let items = page_div.find('.error');
    items.find('.error-text').hide();
    items.removeClass('error');

    // Remove error marking nav button
    if (errors.length == 0) {
      nav_button.removeClass('error');
      return;
    }

    // Add error markings
    nav_button.addClass('error');
    for (const error of errors) {
      this.find_error(error.id, error.type).show();
    }
  }

  static find_error(id, type) {
    let wrapper = FVSignup.get_input(id).closest('.input-wrapper');
    wrapper.addClass('error');
    return wrapper.find('.error-text[error-type='+type+']');
  }
}