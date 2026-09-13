#!/usr/bin/env python
# coding: utf-8

# -----------------------------------------------------------------------------------------------------------------------------#
# Title:              ML closure (web-version)                                                                                 #
# Version:            1.0.5                                                                                                    #   
# Author:             Zhihao Feng                                                                                              # 
# Location:           Gartner's Lab at ChBE of GT, Atlanta, GA                                                                 #
# Start Time:         June   7th, 2023                                                                                         #
# Last Modified Time: Sept. 14th, 2023                                                                                         #
# -----------------------------------------------------------------------------------------------------------------------------#

# -------------------------------------------------- Version Updates Log ------------------------------------------------------#
# Sept. 14th, V1.0.5, 
# Sept.  4th, V1.0.4, integrated with Flask with basic interactive functions                                                   #
# Aug.  30th, V1.0.3, merged and reorganized methods                                                                           #
# July  20th, V1.0.2, included the w(k) predictor                                                                              #
# July  13th, V1.0.1, included the FJC w(k)                                                                                    #
# June   7th, V1.0.0, compiled ML closure                                                                                      #
# -----------------------------------------------------------------------------------------------------------------------------#

# import all necessary packages
## data operations
import numpy as np
import warnings
import glob
import os
import datetime
from colorama import Fore, Back, Style

## QHO machine
from scipy.optimize import fmin, root
import scipy.special
from QHO import Psi_QHO

## plotting
import holoviews as hv
from holoviews import opts
hv.extension('bokeh')

## modeling
import joblib
from scipy.fft import dst, idst
from scipy.signal import find_peaks
from scipy.signal import savgol_filter
import tensorflow as tf
import keras
from keras.models import Sequential, Model, load_model
from keras.layers import Input 

## local deployment 
from flask import Flask, request, render_template


'''------ Define ML closure ------------------------------------------------------------------------------------------------------------------------------------'''
class ml_closure:
    '''------ Define init. -------------------------------------------------------------------------------------------------------------------------------------'''
    def __init__(self, 
                 dr:float, chain_length:int, epsilon:float, density:float, 
                 total_fold:int=5, space_length:int=2048,
                 h_k_start:list=[]):
        
        # define inputs
        self.chain_length = chain_length
        self.epsilon      = epsilon
        self.density      = density
        self.total_fold   = total_fold
        self.space_length = space_length
        
        # define LJ flag
        if self.epsilon == 0:
            self.lj_flag = 0     # flagged as WCA potential
        else: self.lj_flag = 1   # flagged as LJ  potential
        
        # define collectables
        self.scaler_list        = []
        self.model_list         = []
        self.converged_c_k_list = []
        
        # load the scalers used in ML training
        for scaler_i in np.arange(self.total_fold):
            scaler_i_path = os.path.join(os.getcwd(), "scalers_and_models", "scaler_{}.save".format(scaler_i))
            self.scaler_list.append(joblib.load(scaler_i_path))
            print("Scaler_{} was loaded successfully!".format(scaler_i))

        # load the trained models
        for model_i in np.arange(self.total_fold):
            model_i_path = os.path.join(os.getcwd(), "scalers_and_models", "ff_model_{}.h5".format(model_i))
            self.model_list.append(load_model(model_i_path))
            print("Model_{} was loaded successfully!".format(model_i))
        
        # define the default settings for QHO machines
        self.total_order_for_h_k = 60                                        # this is the order range (0 to 59)
        self.QHO_reg             = 0.00001                                   # Set regularization strength (increases smoothness)
        self.QHO_initial_guesses = [-30, 0.001]                              # intial guesses for alpha and omega
        self.start_order_h_k     = 3                                         # this is order to be optimized at for h(k)
        
        # define the real and Fourier spaces
        self.dr          = dr
        self.r_range_max = self.dr * self.space_length
        self.dk          = (np.pi) / self.r_range_max             
        self.r_range     = np.arange(self.dr/2, self.r_range_max+self.dr/2, self.dr)
        self.k_range     = np.arange(self.dk, self.r_range_max/self.dr*self.dk+self.dk, self.dk)
        
        # define the h(k) guess
        if len(h_k_start) == self.space_length:
            self.h_k_start = h_k_start
        else:
            self.h_k_start = np.ones(self.space_length)
            print("h(k)==1 for all space langth is used")
            
    '''---------------------------------------------------------------------------------------------------------------------------------------------------------'''

        
    '''------ QHO machine for ML use ---------------------------------------------------------------------------------------------------------------------------'''
    # define the SSR between Psi and fitted Psi (e.g., Psi_hat) to optimize m and w 
    def SSR(self, aw, x_values, Psi, start_order, mass=1.0):                                                                         
        alpha, omega    = aw                                                                                                        
        Psi_hat         = alpha*Psi_QHO(start_order, x_values, mass, omega)                                                          
        resid           = sum((Psi - Psi_hat)**2)                                                                                     
        return resid

    # collect QHO functions as column vectors
    def QHO_features(self, x_values, total_order, omega, mass=1.0):                                                                  
        cols = []
        for i in np.arange(total_order):
            cols.append(Psi_QHO(i, x_values, mass, omega))
        return np.hstack(cols)

    # define a QHO coefficients generator
    def QHO_coeff(self, x_values, Psi, total_order, reg, omega):
        X       = self.QHO_features(x_values, total_order, omega)                                                                     
        coeff   = np.dot(np.linalg.inv((np.dot(X.T, X) + reg*np.eye(total_order, total_order)).astype(np.float32)), np.dot(X.T, Psi)) 
        Psi_hat = np.dot(X, coeff)
        return coeff, Psi_hat
    
    # compute omega and coeffcients
    def QHO_machine(self, total_order, reg, Initial_guesses, k_array, response_array, start_order):  
        x_values       = np.array(k_array).reshape(len(k_array), 1)
        Psi            = np.array(response_array).reshape(len(k_array), 1)
        optimized_aw   = fmin(self.SSR, Initial_guesses, args=(x_values, Psi, start_order), disp=False)                               
        alpha, omega   = optimized_aw
        coeff, Psi_hat = self.QHO_coeff(x_values, Psi, total_order, reg, omega)
        return omega, coeff
    
    '''---------------------------------------------------------------------------------------------------------------------------------------------------------'''
    
    '''------ Apply the ML w(k) predictor ----------------------------------------------------------------------------------------------------------------------'''
    def w_k_pred(self):
        # recall the scaler
        scaler_w_k = joblib.load("./ML_w_k_predictor/w_k_scaler.save")

        # load the model
        w_k_predictor = load_model("./ML_w_k_predictor/w_k_model.h5")

        # rescale the feature vector
        feature_vector = np.array([self.chain_length, self.epsilon, self.density, self.lj_flag]).reshape(1, len([self.chain_length, self.epsilon, self.density, self.lj_flag])) 
        with warnings.catch_warnings():
                warnings.filterwarnings("ignore", category=UserWarning)
                feature_vector_rescaled = scaler_w_k.transform(feature_vector)

        # predict the w(k)
        pred_target_vector = w_k_predictor.predict(np.asarray(feature_vector_rescaled).astype(np.float32))

        # Reverse QHO for the predicted c(k)
        x_values     = self.k_range.reshape(len(self.k_range), 1)
        QHO_waves    = self.QHO_features(x_values, np.shape(pred_target_vector)[1] - 1, np.abs(pred_target_vector[0][0])) 
        QHO_w_k_pred = np.dot(QHO_waves, pred_target_vector[0][1:]) + 1

        return QHO_w_k_pred
    
    '''---------------------------------------------------------------------------------------------------------------------------------------------------------'''
    
    '''------ Find new gamma with the train model --------------------------------------------------------------------------------------------------------------'''
    def gamma_finder(self, chain_length, epsilon, density, lj_flag,
                     k_range, h_k_guess, w_k_true,
                     total_order_for_h_k, QHO_reg, QHO_initial_guesses, start_order_h_k, 
                     scaler, model):

        # compute omega and coeffs with the QHO machine  
        h_k_omega, h_k_coeff = self.QHO_machine(total_order_for_h_k, QHO_reg, QHO_initial_guesses, k_range, (np.array(k_range)*np.array(h_k_guess)), start_order_h_k) 
        
        # define the feature vector (including the conditions used in the simulation and the QHO features)
        feature_vector  = np.hstack((np.array([chain_length, epsilon, density, lj_flag, h_k_omega]), h_k_coeff.ravel()))
        feature_vector  = np.array(feature_vector).reshape(1, len(feature_vector)) 
        
        # normlize the feature vector
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=UserWarning)
            feature_vector_normalized = scaler.transform(feature_vector) 
            
        # use the train model to predict the k*c(k) omega and coeffs 
        pred_target_vector = model.predict(np.asarray(feature_vector_normalized).astype(np.float32))

        # reverse QHO for the predicted c(k)
        x_values  = k_range.reshape(len(k_range), 1)
        QHO_waves = self.QHO_features(x_values, np.shape(pred_target_vector)[1] - 1, np.abs(pred_target_vector[0][0])) 
        c_k_pred  = np.dot(QHO_waves, pred_target_vector[0][1:])/k_range

        # compute h(k)
        h_k_pred = (w_k_true**2 * c_k_pred) / (1 - density * w_k_true * c_k_pred)

        # compute gamma(k)
        gamma_k_pred = h_k_pred - c_k_pred

        # export the predictions
        return h_k_pred, c_k_pred, gamma_k_pred
    
    '''---------------------------------------------------------------------------------------------------------------------------------------------------------'''
    
    '''------ Solve PRSIM with the ML ensemble and self-consistant convergence loop ----------------------------------------------------------------------------'''
    def gamma_forward_iterations(self):
        
        # predict w(k)
        self.w_k_true = self.w_k_pred()
        print("\u03C9(k) is predicted!")
        
        # converge each model
        for fold in np.arange(self.total_fold):
            # recall the current scaler and model
            scaler = self.scaler_list[fold]
            model  = self.model_list[fold]

            # compute the initial guess of sim h(k) & gamma(k)
            h_k_initial_guess, c_k_initial_pred, gamma_k_initial_guess = self.gamma_finder(self.chain_length, self.epsilon, self.density, self.lj_flag,
                                                                                           self.k_range, self.h_k_start, self.w_k_true,
                                                                                           self.total_order_for_h_k, self.QHO_reg, self.QHO_initial_guesses, self.start_order_h_k, 
                                                                                           scaler, model)

            # track iterations
            iter_tracker = 0
            iter_flag    = True

            # converge the gamma(k) with a forward loop
            ss_gamma_k        = 1                      
            while ss_gamma_k >= 1e-4: 
                # compute the new gamma(k) 
                new_h_k_pred, new_c_k_pred, new_gamma_k = self.gamma_finder(self.chain_length, self.epsilon, self.density, self.lj_flag, 
                                                                            self.k_range, h_k_initial_guess, self.w_k_true,
                                                                            self.total_order_for_h_k, self.QHO_reg, self.QHO_initial_guesses, self.start_order_h_k, 
                                                                            scaler, model)

                # compute the sum of squares of gamma(k)
                ss_gamma_k = sum((new_gamma_k - gamma_k_initial_guess)**2)
#                 print("The current sum of squares of gamma(k) is {} at iter#={}:".format(ss_gamma_k, iter_tracker))

                # update the initial guess of h(k) & gamma(k) 
                gamma_k_initial_guess = np.copy(new_gamma_k)
                h_k_initial_guess     = np.copy(new_h_k_pred)

                # decide if need to stop the loop and move on
                if iter_tracker == 500:
                    iter_flag = False
                    print(Fore.BLUE + "Model_{} failed to converged".format(fold))
                    break

                # update the current iteration tracking
                iter_tracker += 1

            # compile the converged c(k) if only if the iter flag is True
            if iter_flag:
                self.converged_c_k_list.append(new_c_k_pred)
                print(Fore.GREEN + "Model_{} converged successfully".format(fold))
                
        # determine the converge situation (when there is at least one converaged solution)
        if np.shape(self.converged_c_k_list)[0] > 0:

            # report the # models converged
            self.num_model_converged = np.shape(self.converged_c_k_list)[0]

            # compute the c(k) ensemble
            self.c_k_ensemble = np.mean(self.converged_c_k_list, axis=0)

            # compute the h(k) ensemble
            self.h_k_pred = (self.w_k_true**2 * self.c_k_ensemble) / (1 - self.density * self.w_k_true * self.c_k_ensemble)

            # compute g(r) with the converged h(k) 
            g_r_converged = idst(self.h_k_pred*self.k_range/(2*np.pi*self.dr), type=1)/self.r_range + 1

            ## process g(r) for inside of the core (this is temp!!!)
            g_r_hc             = np.zeros(len(self.r_range[self.r_range <= 0.80]))
            self.g_r_processed = np.hstack((g_r_hc, np.array(g_r_converged)[self.r_range > 0.80]))

            # compute kt
            self.s_k_pred = self.w_k_true/(1 - self.density*self.c_k_ensemble*self.w_k_true)
            self.kt_pred  = self.s_k_pred[0] / self.density

            # compute 1st r
            window_low       = 1.0
            window_high      = 1.5
            current_r_window = self.r_range[(self.r_range > window_low) & (self.r_range <= window_high)]
            g_r_pred_window  = self.g_r_processed[(self.r_range > window_low) & (self.r_range <= window_high)]
            peaks_pred, _    = find_peaks(g_r_pred_window)
            if len(peaks_pred) == 0:                                                                            
                self.r_1st_peak_pred = "N.A."
                print("Sorry, the r position of the 1st peak is too subtle to be detected.")
            else:
                self.r_1st_peak_pred = current_r_window[peaks_pred][0]
        else:
            print("This system cannot be solved by the ML closure PRISM")
            
    '''---------------------------------------------------------------------------------------------------------------------------------------------------------'''
    
    '''------ Plot results -------------------------------------------------------------------------------------------------------------------------------------'''
    def all_pred_plots(self):

        # apply the custom theme to set the default size for curve plots
        hv.opts.defaults(
            hv.opts.Curve(
                width=550,  
                height=550,  
                fontsize={'labels': 14, 'ticks': 12, 'title': 14} 
            )
        )
        
        '''------ Plot g(r) ------'''
        # announcement
        print(Fore.BLUE + "g(r) plot is rendering now")
        
        # observe length
        r_observe = 10

        # define overlayed curves
        def get_overlay(r_range, ml_gr, labels):
            g_r_ml     = hv.Curve((r_range, ml_gr), label=labels[0])
#             g_r_py     = hv.Curve((r_range, ml_py), label=labels[0]).opts(line_dash='dashed') 
            g_r_1_line = hv.Curve([[0, 1], [r_observe, 1]]).opts(line_dash='dotted', color="black", line_width=1.5)
            return g_r_ml*g_r_1_line
    
        g_r_curves = get_overlay(self.r_range, self.g_r_processed, ['ML'])

        # plot the overlayed curves
        g_r_curves.opts(
            opts.Overlay(
                title = 'N={}, \u03B5={}, \u03C1={}, # of conv. models={}, \u039At={}'.format(self.chain_length, self.epsilon, np.round(self.density, 3), self.num_model_converged,
                                                                                                 np.round(self.kt_pred, 2)),
                xlim  = (0, r_observe),
                ylim  = (0, None),
                xlabel= 'r', 
                ylabel= 'g(r)',  
                legend_position='bottom_right'  
                )
        )
        
        # export the plot
        hv.save(g_r_curves, ("./static/pred_results/g_r.png"))

        '''------ Plot h(k) ------'''
        # announcement
        print(Fore.BLUE + "h(k) plot is rendering now")
        
        # observe length
        k_observe = 10

       # define overlayed curves
        def get_overlay(k_range, ml_hk, labels):
            h_k_ml     = hv.Curve((k_range, ml_hk), label=labels[0])
#             h_k_py     = hv.Curve((k_range, py_hk), label=labels[0]).opts(line_dash='dashed') 
            h_k_0_line = hv.Curve([[0, 0], [k_observe, 0]]).opts(line_dash='dotted', color="black", line_width=1.5)
            return h_k_ml*h_k_0_line
    
        h_k_curves = get_overlay(self.k_range, self.h_k_pred, ['ML'])

        # plot the overlayed curves
        h_k_curves.opts(
            opts.Overlay(
                title = 'N={}, \u03B5={}, \u03C1={}, # of conv. models={}, \u039At={}'.format(self.chain_length, self.epsilon, np.round(self.density, 3), self.num_model_converged,
                                                                                                 np.round(self.kt_pred, 2)),
                xlim  = (0, k_observe),
                ylim  = (None, None),
                xlabel= 'k', 
                ylabel= 'h(k)', 
                legend_position='bottom_right'  
                )
        )
        
        # export the plot
        hv.save(h_k_curves, ("./static/pred_results/h_k.png"))

        '''------ Plot w(k) ------'''
        # announcement
        print(Fore.BLUE + "\u03C9(k) plot is rendering now")
        
        # observe length
        k_observe = 10

        # define overlayed curves
        def get_overlay(k_range, ml_wk, labels):
            w_k_ml     = hv.Curve((k_range, ml_wk), label=labels[0])
#             w_k_py     = hv.Curve((k_range, py_wk), label=labels[0]).opts(line_dash='dashed') 
            w_k_1_line = hv.Curve([[0, 1], [k_observe, 1]]).opts(line_dash='dotted', color="black", line_width=1.5)
            return w_k_ml*w_k_1_line
    
        w_k_curves = get_overlay(self.k_range, self.w_k_true, ['ML'])

        # plot the overlayed curves
        w_k_curves.opts(
            opts.Overlay(
                title = 'N={}, \u03B5={}, \u03C1={}, # of conv. models={}, \u039At={}'.format(self.chain_length, self.epsilon, np.round(self.density, 3), self.num_model_converged,
                                                                                                 np.round(self.kt_pred, 2)),
                xlim  = (0, k_observe),
                ylim  = (None, None),
                xlabel= 'k', 
                ylabel= '\u03C9(k)', 
                legend_position='top_right'  
                )
        )
        
        # export the plot
        hv.save(w_k_curves, ("./static/pred_results/w_k.png"))

        '''------ Plot s(k) ------'''
        # announcement
        print(Fore.BLUE + "s(k) plot is rendering now")
        
        # observe length
        k_observe = 10

        # define overlayed curves
        def get_overlay(k_range, ml_sk, labels):
            s_k_ml     = hv.Curve((k_range, ml_sk), label=labels[0])
#             s_k_py     = hv.Curve((k_range, py_sk), label=labels[0]).opts(line_dash='dashed') 
            s_k_1_line = hv.Curve([[0, 1], [k_observe, 1]]).opts(line_dash='dotted', color="black", line_width=1.5)
            return s_k_ml*s_k_1_line
    
        s_k_curves = get_overlay(self.k_range, self.s_k_pred, ['ML'])

        # plot the overlayed curves
        s_k_curves.opts(
            opts.Overlay(
                title = 'N={}, \u03B5={}, \u03C1={}, # of conv. models={}, \u039At={}'.format(self.chain_length, self.epsilon, np.round(self.density, 3), self.num_model_converged,
                                                                                                 np.round(self.kt_pred, 2)),
                xlim  = (0, k_observe),
                ylim  = (None, None),
                xlabel= 'k', 
                ylabel= 's(k)', 
                legend_position='bottom_right'  
                )
        )
        
        # export the plot
        hv.save(s_k_curves, ("./static/pred_results/s_k.png"))

        '''------ Plot c(k) ------'''
        # announcement
        print(Fore.BLUE + "c(k) plot is rendering now")
        
        # observe length
        k_observe = 10

        # define overlayed curves
        def get_overlay(k_range, ml_ck, ml_ck_list, labels):
            c_k_ml     = hv.Curve((k_range, ml_ck), label=labels[0])
            c_k_se     = np.std(np.array(ml_ck_list).astype(float), axis=0)/np.sqrt(self.num_model_converged)
            upper      = ml_ck + c_k_se
            lower      = ml_ck - c_k_se
            c_k_shade  = hv.Area((k_range, lower, upper), vdims=["lower", "upper"]).opts(color="gray", alpha=0.3)
#             c_k_py      = hv.Curve((k_range, py_ck), label=labels[0]).opts(line_dash='dashed') 
            c_k_0_line = hv.Curve([[0, 0], [k_observe, 0]]).opts(line_dash='dotted', color="black", line_width=1.5)
            return c_k_ml*c_k_shade*c_k_0_line
    
        c_k_curves = get_overlay(self.k_range, self.c_k_ensemble, self.converged_c_k_list, ['ML'])

        # plot the overlayed curves
        c_k_curves.opts(
            opts.Overlay(
                title = 'N={}, \u03B5={}, \u03C1={}, # of conv. models={}, \u039At={}'.format(self.chain_length, self.epsilon, np.round(self.density, 3), self.num_model_converged,
                                                                                                 np.round(self.kt_pred, 2)),
                xlim  = (0, k_observe),
                ylim  = (None, None),
                xlabel= 'k', 
                ylabel= 'c(k)', 
                legend_position='bottom_right'  
                )
        )
        
        # export the plot
        hv.save(c_k_curves, ("./static/pred_results/c_k.png"))

        '''---------------------------------------------------------------------------------------------------------------------------------------------------------'''
    
        '''------ Export results -----------------------------------------------------------------------------------------------------------------------------------'''
        print(Fore.BLUE + "Saving predicted data!")
        pred_data_arr = np.array((self.r_range, self.g_r_processed, self.k_range, self.h_k_pred, self.w_k_true, self.c_k_ensemble, self.s_k_pred)).T
        np.savetxt("./static/pred_results/pred_data.txt", pred_data_arr, header='r_range, g_r, k_range, h_k, w_k, c_k, s_k')


'''------ Build a flask ------'''
# define the app name
app = Flask(__name__)

# define home route
@app.route("/")
def home():
    return render_template("index.html")

# define post back from the server
@app.route("/predict", methods=['POST'])

# define prediction
def predict():
    # collect new features
    new_features = [float(x) for x in request.form.values()]

    # call the ML closure
    ml_closure_web = ml_closure(dr=0.0075, 
                                chain_length=new_features[0], 
                                epsilon=new_features[1], 
                                density=new_features[2])

    # converge the ml closure solution
    ml_closure_web.gamma_forward_iterations()

    # plot the solution
    ml_closure_web.all_pred_plots()    

    return render_template('index.html', 
                           pred_text = "Converged Successfully!")

if __name__ == "__main__":
    app.run()