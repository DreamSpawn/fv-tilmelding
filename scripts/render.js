"using strict";

class FVSignupRender {
  static navigation(pages, keys, navigation) {
    let lang = fv_signup_settings.lang;

    keys.forEach( key => {
      let slug = "<div page-id='"+key+"' class='loading'>"+pages[key].slug[lang]+"</div>";
      navigation.append(slug);    
    })
  }

  static page(page, key, element, callback) {
    let lang = fv_signup_settings.lang;

    let page_div = element.find("div#"+key);
    if (!page_div.length) {
      page_div = jQuery('<div id="'+key+'" class="signup-page"></div>')
      page_div.hide();
      element.append(page_div);
    }

    page_div.empty();
    page.title[lang] && page_div.append("<h2>"+page.title[lang]+"</h2>");

    let module = false;
    page.sections && page.sections.forEach(function(section) {
      section.headline && page_div.append("<h3>"+section.headline[lang]+"</h3>");
      if(section.module) {
        FVSignup.add_module(section.module, page_div, callback);
        module = true;
      }
      section.items && section.items.forEach(function(item) {
        if (item.disabled) return;
        FVSignupLogic.require_config(function() {
          page_div.append(InfosysSignupRender.render_element(item, lang, FVSignup.config));
        })
      })
    });

    if (page.order > 1) {
      let text = lang == 'da' ? 'Forrige' : 'Previous';
      let prev_button = jQuery('<button></button>');
      prev_button.addClass('previous-button');
      prev_button.text(text);
      prev_button.click(function() { FVSignupLogic.prev(); });
      page_div.append(prev_button);
    }
    if (page.order < FVSignup.page_keys.length) {
      let text = lang == 'da' ? 'Næste' : 'Next';
      let next_button = jQuery('<button></button>');
      next_button.addClass('next-button');
      next_button.text(text);
      next_button.click(function() {FVSignupLogic.next(); });
      page_div.append(next_button);
    }

    let nav_button = jQuery("nav div[page-id='"+key+"']");
    nav_button.removeClass('loading');
    nav_button.addClass('ready');

    // If page has a module we need to wait for it to load before page is ready
    if (!module) {
      callback();
    }
  }

  static unknown_module(name, element) {
    element.append('<p><strong>Unknown module '+name+'</strong></p>');
  }
}